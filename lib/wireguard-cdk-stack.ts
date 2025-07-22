import { CfnOutput, Stack, StackProps } from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as assets from "aws-cdk-lib/aws-s3-assets";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type WireguardCdkStackProps = StackProps & {
  instanceClass: ec2.InstanceClass;
  instanceSize: ec2.InstanceSize;
  sshPubKey: string;
  domain: string;
  email: string;
};

export class WireguardCdkStack extends Stack {
  constructor(scope: Construct, id: string, props: WireguardCdkStackProps) {
    super(scope, id, props);

    // Get default VPC
    const vpc = ec2.Vpc.fromLookup(this, "VPC", { isDefault: true });

    // Create security group for inbound and outbound traffic
    const sg = new ec2.SecurityGroup(this, "SSHSecurityGroup", {
      vpc: vpc,
      description: "Security Group for SSH",
      allowAllOutbound: true,
    });

    // SSH access
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22));

    // Web portal access
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443));
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.udp(443));

    // WireGuard VPN access
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.udp(51820));
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(51821));

    // Create asset from `assets` directory to include configuration files
    const configAsset = new assets.Asset(this, "ConfigAsset", {
      path: path.join(__dirname, "../assets"),
    });

    // Add user data that is used to configure the EC2 instance
    const userData = ec2.UserData.forLinux();
    // NOTE: Default Ubuntu distribution does not have cfn-signal installed.
    // We need to install it manually.
    userData.addCommands(
      "apt-get update -y",
      "apt-get install -y git awscli ec2-instance-connect",
      'until git clone https://github.com/aws-quickstart/quickstart-linux-utilities.git; do echo "Retrying"; done',
      "cd /quickstart-linux-utilities",
      "source quickstart-cfn-tools.source",
      "qs_update-os || qs_err",
      "qs_bootstrap_pip || qs_err",
      "qs_aws-cfn-bootstrap || qs_err",
      "mkdir -p /opt/aws/bin",
      "ln -s /usr/local/bin/cfn-* /opt/aws/bin/",
    );
    userData.addCommands(
      "apt update -y",
      "apt install -y unzip docker.io docker-compose",
      `aws s3 cp s3://${configAsset.s3BucketName}/${configAsset.s3ObjectKey} /tmp/assets.zip`,
      "cd /tmp && unzip assets.zip",
      "mkdir -p /home/ubuntu/wireguard",
      "cp -r assets/* /home/ubuntu/wireguard/",
      "chown -R ubuntu:ubuntu /home/ubuntu/wireguard",
      `echo "DOMAIN=${props.domain}" > /home/ubuntu/wireguard/.env`,
      `echo "EMAIL=${props.email}" >> /home/ubuntu/wireguard/.env`,
      "chown ubuntu:ubuntu /home/ubuntu/wireguard/.env",
      "systemctl enable docker",
      "systemctl start docker",
      "usermod -aG docker ubuntu",
      "cd /home/ubuntu/wireguard",
      "docker-compose -f docker-compose.proxy.yml up -d",
      "docker-compose -f docker-compose.yml up -d",
    );

    // Create IAM role for the instance with S3 read permissions
    const role = new iam.Role(this, "InstanceRole", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
    });
    configAsset.grantRead(role);

    // Create a new EC2 instance
    const instance = new ec2.Instance(this, "WireguardInstance", {
      vpc: vpc,
      instanceType: ec2.InstanceType.of(
        props.instanceClass,
        props.instanceSize,
      ),
      machineImage: ec2.MachineImage.fromSsmParameter(
        "/aws/service/canonical/ubuntu/server/jammy/stable/current/amd64/hvm/ebs-gp2/ami-id", // Ubuntu 22.04 LTS
        { os: ec2.OperatingSystemType.LINUX },
      ),
      securityGroup: sg,
      role: role,
      userData: userData,
      init: ec2.CloudFormationInit.fromElements(
        ec2.InitFile.fromString(
          "/home/ubuntu/.ssh/authorized_keys",
          props.sshPubKey + "\n",
        ),
      ),
    });

    // Add the SSH Security Group to the EC2 instance
    instance.addSecurityGroup(sg);

    // Create and associate Elastic IP
    const eip = new ec2.CfnEIP(this, "WireguardEIP", {
      domain: "vpc",
      instanceId: instance.instanceId,
    });
    new CfnOutput(this, "WireguardInstanceIP", {
      value: eip.attrPublicIp,
      description: "The public IP address of the WireGuard instance",
    });
  }
}

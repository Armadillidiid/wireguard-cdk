import { CfnOutput, Duration, Stack, StackProps } from "aws-cdk-lib";
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
  wireguardUsername: string;
  wireguardPassword: string;
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
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80));
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443));
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.udp(443));

    // WireGuard VPN access
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.udp(51820));
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(51821));

    // Create asset from `assets` directory to include configuration files
    const configAsset = new assets.Asset(this, "ConfigAsset", {
      path: path.join(__dirname, "../assets"),
    });

    const homeDir = "/home/ubuntu";
    const user = "ubuntu";

    // Add user data that is used to configure the EC2 instance
    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      "apt-get update -y",
      "apt-get install -y python3-pip",
      "PIP_BREAK_SYSTEM_PACKAGES=1 pip3 install https://s3.amazonaws.com/cloudformation-examples/aws-cfn-bootstrap-py3-latest.tar.gz",
      "mkdir -p /opt/aws/bin",
      "ln -s /usr/local/bin/cfn-* /opt/aws/bin/",
      "ln -s /usr/local/bin/cfn-hup /etc/init.d/cfn-hup",
      "snap install aws-cli --classic",
      "apt-get install -y git ec2-instance-connect unzip docker.io docker-compose",
    );
    userData.addCommands(
      `aws s3 cp s3://${configAsset.s3BucketName}/${configAsset.s3ObjectKey} /tmp/assets.zip`,
      `mkdir -p ${homeDir}/wireguard`,
      `unzip -d ${homeDir}/wireguard /tmp/assets.zip`,
      `chown -R ${user}:${user} ${homeDir}/wireguard`,
      `echo "DOMAIN=${props.domain}" > ${homeDir}/wireguard/.env`,
      `echo "EMAIL=${props.email}" >> ${homeDir}/wireguard/.env`,
      "TOKEN=$(curl -X PUT 'http://169.254.169.254/latest/api/token' -H 'X-aws-ec2-metadata-token-ttl-seconds: 21600')",
      `echo "INSTANCE_IP=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/public-ipv4)" >> ${homeDir}/wireguard/.env`,
      `echo "INIT_USERNAME=${props.wireguardUsername}" >> ${homeDir}/wireguard/.env`,
      `echo "INIT_PASSWORD=${props.wireguardPassword}" >> ${homeDir}/wireguard/.env`,
      `chown ${user}:${user} ${homeDir}/wireguard/.env`,
      "systemctl enable docker",
      "systemctl start docker",
      `usermod -aG docker ${user}`,
      "newgrp docker",
      `cd ${homeDir}/wireguard`,
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
        { os: ec2.OperatingSystemType.LINUX, userData: userData },
      ),
      securityGroup: sg,
      role: role,
      init: ec2.CloudFormationInit.fromElements(
        ec2.InitFile.fromString(
          `${homeDir}/.ssh/authorized_keys`,
          props.sshPubKey + "\n",
        ),
      ),
      initOptions: {
        timeout: Duration.minutes(10),
        includeUrl: true,
        includeRole: true,
      },
      requireImdsv2: true,
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

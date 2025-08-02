import {
  CfnOutput,
  CfnParameter,
  CustomResource,
  Duration,
  Stack,
  type StackProps,
} from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as assets from "aws-cdk-lib/aws-s3-assets";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
import path from "path";
import { fileURLToPath } from "url";
import { CustomS3BucketProvider } from "./s3-client/provider.ts";
import { S3_CUSTOM_RESOURCE_RESPONSE_ATTR } from "./s3-client/handler/index.ts";
import type { S3CustomResourceProperties } from "./s3-client/schema.ts";

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

    const wireguardUsernameParam = new CfnParameter(this, "WireguardUsername", {
      type: "String",
      description: "Admin username for WireGuard web interface",
      minLength: 1,
      maxLength: 50,
    });

    const wireguardPasswordParam = new CfnParameter(this, "WireguardPassword", {
      type: "String",
      description:
        "Admin password for WireGuard web interface (Minimum 12 characters)",
      minLength: 12,
      maxLength: 128,
      noEcho: true,
    });

    const vpc = ec2.Vpc.fromLookup(this, "VPC", { isDefault: true });

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

    const configAsset = new assets.Asset(this, "ConfigAsset", {
      path: path.join(__dirname, "../assets"),
    });

    // Conditionally create S3 bucket if does not exist
    const bucketProperties = {
      BucketName: `wireguard-backups-${this.account}-${this.region}`,
      PublicReadAccess: false,
      Versioning: true,
    } satisfies S3CustomResourceProperties;
    const bucketResource = new CustomResource(this, "BucketResource", {
      serviceToken: CustomS3BucketProvider.getOrCreate(this, bucketProperties),
      properties: bucketProperties,
    });
    const bucketName = bucketResource.getAttString(
      S3_CUSTOM_RESOURCE_RESPONSE_ATTR.BUCKET_NAME,
    );

    // Import bucket whether it was just created or already existed
    const backupBucket = s3.Bucket.fromBucketName(
      this,
      "ImportedOrCreatedBucket",
      bucketName,
    );

    const user = "ubuntu";
    const homeDir = `/home/${user}`;

    const eip = new ec2.CfnEIP(this, "WireguardEIP", {
      domain: "vpc",
    });

    const userData = ec2.UserData.forLinux();
    // NOTE: Below adds `cfn-signal` and other AWS utilities to the instance
    // Failure to do this will cause the CFN stack to hang indefinitely
    userData.addCommands(
      "apt-get update -y",
      "apt-get install -y python3-pip",
      "PIP_BREAK_SYSTEM_PACKAGES=1 pip3 install https://s3.amazonaws.com/cloudformation-examples/aws-cfn-bootstrap-py3-latest.tar.gz",
      "mkdir -p /opt/aws/bin",
      "ln -s /usr/local/bin/cfn-* /opt/aws/bin/",
      "ln -s /usr/local/bin/cfn-hup /etc/init.d/cfn-hup",
      "snap install aws-cli --classic",
    );

    // Setup WireGuard
    userData.addCommands(
      "apt-get install -y git ec2-instance-connect unzip docker.io docker-compose",
      "systemctl enable docker",
      "systemctl start docker",
      `usermod -aG docker ${user}`,
      "newgrp docker",
      `aws s3 cp s3://${configAsset.s3BucketName}/${configAsset.s3ObjectKey} /tmp/assets.zip`,
      `mkdir -p ${homeDir}/wireguard`,
      `unzip -d ${homeDir}/wireguard /tmp/assets.zip`,
      `chown -R ${user}:${user} ${homeDir}/wireguard`,
      `echo "DOMAIN=${props.domain}" > ${homeDir}/wireguard/.env`,
      `echo "EMAIL=${props.email}" >> ${homeDir}/wireguard/.env`,
      `echo "INSTANCE_IP=${eip.attrPublicIp}" >> ${homeDir}/wireguard/.env`,
      `echo "INIT_USERNAME=${wireguardUsernameParam.valueAsString}" >> ${homeDir}/wireguard/.env`,
      `echo "INIT_PASSWORD=${wireguardPasswordParam.valueAsString}" >> ${homeDir}/wireguard/.env`,
      `chown ${user}:${user} ${homeDir}/wireguard/.env`,
      `cd ${homeDir}/wireguard`,
      `mkdir -p ${homeDir}/wireguard/data`,
      `chown -R ${user}:${user} ${homeDir}/wireguard/data`,
      `aws s3 cp s3://${backupBucket.bucketName}/wireguard-backup.tar.gz /tmp/wireguard-backup.tar.gz || echo 'No backup found, starting fresh'`,
      "if [ -f /tmp/wireguard-backup.tar.gz ]; then tar -xzf /tmp/wireguard-backup.tar.gz -C /tmp; fi",
      `if [ -d /tmp/data ]; then cp -r /tmp/data/* ${homeDir}/wireguard/data/; chown -R ${user}:${user} ${homeDir}/wireguard/data; rm -rf /tmp/data /tmp/wireguard-backup.tar.gz; fi`,
      "docker-compose -f docker-compose.proxy.yml up -d",
      "docker-compose -f docker-compose.yml up -d",
    );

    // Setup backup
    userData.addCommands(
      `cp ${homeDir}/wireguard/backup-wireguard.sh ${homeDir}/backup-wireguard.sh`,
      `chmod +x ${homeDir}/backup-wireguard.sh`,
      `chown ${user}:${user} ${homeDir}/backup-wireguard.sh`,
      `echo "0 0 * * * ${user} ${homeDir}/backup-wireguard.sh ${backupBucket.bucketName}" | tee /etc/cron.d/wg-easy-backup`,
    );

    const role = new iam.Role(this, "InstanceRole", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
    });
    configAsset.grantRead(role);
    backupBucket.grantReadWrite(role);

    const instance = new ec2.Instance(this, "WireguardInstance", {
      vpc: vpc,
      instanceType: ec2.InstanceType.of(
        props.instanceClass,
        props.instanceSize,
      ),
      machineImage: ec2.MachineImage.fromSsmParameter(
        "/aws/service/canonical/ubuntu/server/jammy/stable/current/amd64/hvm/ebs-gp2/ami-id", // Ubuntu 22.04 LTS
      ),
      userData: userData,
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
      },
      requireImdsv2: true,
    });

    instance.addSecurityGroup(sg);

    new ec2.CfnEIPAssociation(this, "WireguardEIPAssociation", {
      allocationId: eip.attrAllocationId,
      instanceId: instance.instanceId,
    });

    new CfnOutput(this, "WireguardInstanceIP", {
      value: eip.attrPublicIp,
      description: "The public IP address of the WireGuard instance",
    });

    new CfnOutput(this, "WireguardBackupBucketOutput", {
      value: backupBucket.bucketName,
      description: "S3 bucket name for WireGuard backups",
    });
  }
}

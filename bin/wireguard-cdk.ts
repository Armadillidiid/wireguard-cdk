#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { WireguardCdkStack } from "../lib/wireguard-cdk-stack.ts";
import { env } from "../env.ts";

const app = new cdk.App();

new WireguardCdkStack(app, "WireguardCdkStack", {
  env: {
    account: env.CDK_DEFAULT_ACCOUNT,
    region: env.CDK_DEFAULT_REGION,
  },
  instanceClass: env.EC2_INSTANCE_CLASS,
  instanceSize: env.EC2_INSTANCE_SIZE,
  sshPubKey: env.SSH_PUB_KEY,
  domain: env.DOMAIN,
  email: env.EMAIL,
});

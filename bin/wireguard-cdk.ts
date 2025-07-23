#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { WireguardCdkStack } from "../lib/wireguard-cdk-stack.js";
import { env } from "../env.js";

const app = new cdk.App();

const wireguardUsername = app.node.getContext('wireguard-username');
const wireguardPassword = app.node.getContext('wireguard-password');

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
  wireguardUsername,
  wireguardPassword,
});

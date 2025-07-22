#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { WireguardCdkStack } from "../lib/wireguard-cdk-stack.js";
import { env } from "../env.js";

const app = new cdk.App();
new WireguardCdkStack(app, "WireguardCdkStack", {
  instanceClass: env.EC2_INSTANCE_CLASS,
  instanceSize: env.EC2_INSTANCE_SIZE,
  sshPubKey: env.SSH_PUB_KEY,
});

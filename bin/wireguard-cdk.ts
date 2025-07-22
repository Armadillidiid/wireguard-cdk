#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { WireguardCdkStack } from '../lib/wireguard-cdk-stack';

const app = new cdk.App();
new WireguardCdkStack(app, 'WireguardCdkStack');

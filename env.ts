import { z } from "zod";
import * as ec2 from "aws-cdk-lib/aws-ec2";

const schema = z.object({
  EMAIL: z.email().describe("Email address for SSL/TLS certificate").nonempty(),
  DOMAIN: z.string().describe("Domain for SSL/TLS certificate").nonempty(),
  EC2_INSTANCE_CLASS: z.enum(ec2.InstanceClass),
  EC2_INSTANCE_SIZE: z.enum(ec2.InstanceSize),
  SSH_PUB_KEY: z
    .string()
    .describe("SSH public key for EC2 instance access")
    .nonempty(),
  CDK_DEFAULT_ACCOUNT: z.string().nonempty(),
  CDK_DEFAULT_REGION: z.string().nonempty(),
});

export const env = schema.parse(process.env);

declare global {
  namespace NodeJS {
    interface ProcessEnv extends z.infer<typeof schema> {}
  }
}

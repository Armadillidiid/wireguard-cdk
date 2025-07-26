import { z } from "zod";
import * as ec2 from "aws-cdk-lib/aws-ec2";
declare const schema: z.ZodObject<{
    EMAIL: z.ZodEmail;
    DOMAIN: z.ZodString;
    EC2_INSTANCE_CLASS: z.ZodEnum<typeof ec2.InstanceClass>;
    EC2_INSTANCE_SIZE: z.ZodEnum<typeof ec2.InstanceSize>;
    SSH_PUB_KEY: z.ZodString;
    CDK_DEFAULT_ACCOUNT: z.ZodString;
    CDK_DEFAULT_REGION: z.ZodString;
}, z.core.$strip>;
export declare const env: {
    EMAIL: string;
    DOMAIN: string;
    EC2_INSTANCE_CLASS: ec2.InstanceClass;
    EC2_INSTANCE_SIZE: ec2.InstanceSize;
    SSH_PUB_KEY: string;
    CDK_DEFAULT_ACCOUNT: string;
    CDK_DEFAULT_REGION: string;
};
declare global {
    namespace NodeJS {
        interface ProcessEnv extends z.infer<typeof schema> {
        }
    }
}
export {};

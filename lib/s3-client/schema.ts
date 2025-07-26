import { ServerSideEncryption } from "aws-cdk-lib/aws-s3-deployment";
import { z } from "zod";

export const s3CustomResourcePropertiesSchema = z.object({
  BucketName: z.string(),
  Versioning: z.boolean().optional(),
  PublicReadAccess: z.boolean().optional(),
  Encryption: z
    .enum([ServerSideEncryption.AES_256, ServerSideEncryption.AWS_KMS])
    .optional(),
  KmsKeyId: z.string().optional(),
});

export type S3CustomResourceProperties = z.infer<
  typeof s3CustomResourcePropertiesSchema
>;

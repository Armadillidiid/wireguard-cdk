/// <reference path="../../node_modules/aws-cdk-lib/custom-resources/lib/provider-framework/types.d.ts" />
/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable no-console */

import {
  S3Client,
  CreateBucketCommand,
  PutBucketVersioningCommand,
  PutBucketEncryptionCommand,
  PutPublicAccessBlockCommand,
  HeadBucketCommand,
  ServerSideEncryption,
} from "@aws-sdk/client-s3";
import { z } from "zod";

const s3Client = new S3Client();

const s3CustomResourcePropertiesSchema = z.object({
  BucketName: z.string(),
  Versioning: z.boolean().optional(),
  PublicReadAccess: z.boolean().optional(),
  Encryption: z.enum(["aws:kms", "AES256"]).optional(),
  KmsKeyId: z.string().optional(),
});

type S3CustomResourceProperties = z.infer<typeof s3CustomResourcePropertiesSchema>;

interface CustomResourceEvent extends AWSCDKAsyncCustomResource.OnEventRequest {
  ResourceProperties: S3CustomResourceProperties;
  OldResourceProperties?: S3CustomResourceProperties;
}

exports.handler = async (event: CustomResourceEvent) => {
  console.log("Event:", JSON.stringify(event, null, 2));

  const { RequestType } = event;

  try {
    switch (RequestType) {
      case "Create":
        return await handleCreate(event);
      case "Update":
        return await handleUpdate(event);
      case "Delete":
        return await handleDelete(event);
      default:
        throw new Error(`Unknown request type: ${RequestType}`);
    }
  } catch (error) {
    console.error("Error:", error);
    throw error;
  }
};

async function handleCreate(event: CustomResourceEvent) {
  const resourceProperties = s3CustomResourcePropertiesSchema.parse(
    event.ResourceProperties,
  );
  const {
    BucketName: bucketName,
    Versioning: versioning,
    PublicReadAccess: publicReadAccess,
    Encryption: encryption,
    KmsKeyId: kmsKeyId,
  } = resourceProperties;

  console.log(`Creating bucket: ${bucketName}`);

  // Create the bucket
  try {
    await s3Client.send(
      new CreateBucketCommand({
        Bucket: bucketName,
      }),
    );
    console.log(`Bucket ${bucketName} created successfully`);
  } catch (error: any) {
    if (error.name === "BucketAlreadyOwnedByYou") {
      console.log(`Bucket ${bucketName} already exists and is owned by you`);
    } else {
      throw error;
    }
  }

  // Configure versioning if specified
  if (versioning) {
    await s3Client.send(
      new PutBucketVersioningCommand({
        Bucket: bucketName,
        VersioningConfiguration: {
          Status: "Enabled",
        },
      }),
    );
    console.log("Versioning enabled");
  }

  // Configure public access block (inverse of publicReadAccess)
  await s3Client.send(
    new PutPublicAccessBlockCommand({
      Bucket: bucketName,
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: !publicReadAccess,
        IgnorePublicAcls: !publicReadAccess,
        BlockPublicPolicy: !publicReadAccess,
        RestrictPublicBuckets: !publicReadAccess,
      },
    }),
  );

  // Configure encryption if specified
  if (encryption) {
    const encryptionConfig: any = {
      Bucket: bucketName,
      ServerSideEncryptionConfiguration: {
        Rules: [
          {
            ApplyServerSideEncryptionByDefault: {
              SSEAlgorithm:
                encryption === "aws:kms"
                  ? ServerSideEncryption.aws_kms
                  : ServerSideEncryption.AES256,
            },
          },
        ],
      },
    };

    if (encryption === "aws:kms" && kmsKeyId) {
      encryptionConfig.ServerSideEncryptionConfiguration.Rules[0].ApplyServerSideEncryptionByDefault.KMSMasterKeyID =
        kmsKeyId;
    }

    await s3Client.send(new PutBucketEncryptionCommand(encryptionConfig));
    console.log(`Encryption configured: ${encryption}`);
  }

  return {
    PhysicalResourceId: bucketName,
    Data: {
      BucketName: bucketName,
    },
  };
}

async function handleUpdate(event: CustomResourceEvent) {
  const resourceProperties = s3CustomResourcePropertiesSchema.parse(
    event.ResourceProperties,
  );
  const {
    BucketName: bucketName,
    Versioning: versioning,
    PublicReadAccess: publicReadAccess,
    Encryption: encryption,
    KmsKeyId: kmsKeyId,
  } = resourceProperties;

  console.log(`Update requested for bucket: ${bucketName}`);

  const oldProps = event.OldResourceProperties;
  const newProps = event.ResourceProperties;

  // Check if bucket name changed - this would require recreation, so do nothing
  if (oldProps?.BucketName !== newProps.BucketName) {
    console.log(
      "Bucket name change detected - skipping update to avoid recreation",
    );
    return {
      PhysicalResourceId: oldProps?.BucketName, // Keep old physical ID
      Data: {
        BucketName: oldProps?.BucketName,
      },
    };
  }

  // Check if bucket exists
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: bucketName }));
  } catch (error) {
    console.log("Bucket does not exist - skipping update");
    return {
      PhysicalResourceId: bucketName,
      Data: {
        BucketName: bucketName,
      },
    };
  }

  // Update versioning if changed and safe to do so
  if (oldProps?.Versioning !== newProps.Versioning) {
    if (newProps.Versioning) {
      // Enabling versioning is safe
      await s3Client.send(
        new PutBucketVersioningCommand({
          Bucket: bucketName,
          VersioningConfiguration: {
            Status: "Enabled",
          },
        }),
      );
      console.log("Versioning enabled");
    } else {
      // Disabling versioning could be destructive, so skip
      console.log(
        "Versioning disable requested - skipping to avoid potential data loss",
      );
    }
  }

  // Update public access settings if changed
  if (oldProps?.PublicReadAccess !== newProps.PublicReadAccess) {
    await s3Client.send(
      new PutPublicAccessBlockCommand({
        Bucket: bucketName,
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: !publicReadAccess,
          IgnorePublicAcls: !publicReadAccess,
          BlockPublicPolicy: !publicReadAccess,
          RestrictPublicBuckets: !publicReadAccess,
        },
      }),
    );
    console.log("Public access settings updated");
  }

  // Update encryption if changed and safe to do so
  if (
    oldProps?.Encryption !== newProps.Encryption ||
    oldProps?.KmsKeyId !== newProps.KmsKeyId
  ) {
    if (encryption) {
      const encryptionConfig: any = {
        Bucket: bucketName,
        ServerSideEncryptionConfiguration: {
          Rules: [
            {
              ApplyServerSideEncryptionByDefault: {
                SSEAlgorithm:
                  encryption === "aws:kms"
                    ? ServerSideEncryption.aws_kms
                    : ServerSideEncryption.AES256,
              },
            },
          ],
        },
      };

      if (encryption === "aws:kms" && kmsKeyId) {
        encryptionConfig.ServerSideEncryptionConfiguration.Rules[0].ApplyServerSideEncryptionByDefault.KMSMasterKeyID =
          kmsKeyId;
      }

      await s3Client.send(new PutBucketEncryptionCommand(encryptionConfig));
      console.log(`Encryption updated: ${encryption}`);
    }
  }

  return {
    PhysicalResourceId: bucketName,
    Data: {
      BucketName: bucketName,
    },
  };
}

async function handleDelete(event: CustomResourceEvent) {
  const resourceProperties = s3CustomResourcePropertiesSchema.parse(
    event.ResourceProperties,
  );
  const { BucketName: bucketName } = resourceProperties;

  console.log(
    `Delete requested for bucket: ${bucketName} - doing nothing as requested`,
  );

  return {
    PhysicalResourceId: bucketName,
    Data: {
      BucketName: bucketName,
    },
  };
}

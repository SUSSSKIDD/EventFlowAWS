#!/bin/bash
echo "Initializing AWS services on LocalStack..."

# 1. Create Kinesis Stream
echo "Creating Kinesis Stream 'raw-events-stream' with 2 shards..."
awslocal kinesis create-stream --stream-name raw-events-stream --shard-count 2

# 2. Create S3 Bucket
echo "Creating S3 Bucket 'eventflow-cold-archive'..."
awslocal s3 mb s3://eventflow-cold-archive

echo "AWS services initialized successfully!"

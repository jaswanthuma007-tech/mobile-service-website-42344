#!/bin/bash
cd /home/kavia/workspace/code-generation/mobile-service-website-42344/mobile_service_frontend
npm run build
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
   exit 1
fi


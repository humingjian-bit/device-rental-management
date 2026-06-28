#!/bin/bash
# 一键部署脚本 - SSH恢复后执行
set -e
cd /opt/app
git fetch origin
git reset --hard origin/main
npm run build
pm2 restart device-rental
echo "部署完成！"

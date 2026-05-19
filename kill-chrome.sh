#!/bin/sh
for pid in $(ls /proc | grep '^[0-9]'); do
  exe=$(readlink /proc/$pid/exe 2>/dev/null)
  if echo "$exe" | grep -q chrome; then
    kill -9 $pid 2>/dev/null
  fi
done
rm -f /root/.config/google-chrome/SingletonLock
rm -f /root/.config/google-chrome/SingletonSocket
echo "chrome killed"

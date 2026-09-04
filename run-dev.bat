@echo off
set PEAKGRAVITY_DEV=1
start "vite" cmd /c "node_modules\.bin\vite.cmd dev > electron\vite.log 2> electron\vite-err.log"
echo Waiting for Vite on 8080...
node_modules\.bin\wait-on.cmd http://localhost:8080
echo Starting Electron...
node_modules\.bin\electron.cmd electron\dist\main.js

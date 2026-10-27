@echo off
rem Serves the game locally (browsers block ES modules from file://) and opens it.
cd /d "%~dp0"
start "" http://localhost:8123
python -m http.server 8123

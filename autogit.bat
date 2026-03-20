@echo off
REM Auto-GIT global launcher — works from any directory
REM Activates the conda env and runs the unified CLI

REM Try conda env first
if exist "D:\.conda\envs\auto-git\Scripts\auto-git.exe" (
    "D:\.conda\envs\auto-git\Scripts\auto-git.exe" %*
    exit /b %ERRORLEVEL%
)

REM Fallback: run via python directly
set "AUTOGIT_ROOT=%~dp0"
"D:\.conda\envs\auto-git\python.exe" "%AUTOGIT_ROOT%cli_entry.py" %*

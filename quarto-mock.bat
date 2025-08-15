@echo off
setlocal ENABLEDELAYEDEXPANSION
echo Mock Quarto renderer running...
echo Args: %*

set inputFile=
set outputFile=

REM Parse arguments: look for first existing file as input and --output <path>
:parseLoop
if "%~1"=="" goto haveArgs
if /I "%~1"=="--output" (
        shift
        set outputFile=%~1
        shift
        goto parseLoop
)
if not defined inputFile if exist "%~1" set inputFile=%~1
shift
goto parseLoop

:haveArgs
if not defined inputFile (
    echo No input file detected. Exiting.
    exit /b 0
)

if not defined outputFile (
    REM Derive output beside inputFile with .pdf extension
    for %%F in ("%inputFile%") do set outputFile=%%~dpnF.pdf
)

echo Input: %inputFile%
echo Output: %outputFile%

REM Ensure output directory exists
for %%D in ("%outputFile%") do if not exist "%%~dpD" mkdir "%%~dpD" >NUL 2>&1

REM Write a minimal valid PDF (VERY small) so PDF viewers open it
(
echo %PDF-1.1
echo 1 0 obj^<^< /Type /Catalog /Pages 2 0 R ^>^> endobj
echo 2 0 obj^<^< /Type /Pages /Kids [3 0 R] /Count 1 ^>^> endobj
echo 3 0 obj^<^< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources ^<^<^>^> ^>^> endobj
echo 4 0 obj^<^< /Length 44 ^>^> stream
echo BT /F1 12 Tf 72 100 Td (Mock PDF Output) Tj ET
echo endstream endobj
echo xref
echo 0 5
echo 0000000000 65535 f 
echo 0000000010 00000 n 
echo 0000000079 00000 n 
echo 0000000174 00000 n 
echo 0000000303 00000 n 
echo trailer ^<^< /Size 5 /Root 1 0 R ^>^>
echo startxref
echo 403
echo %%EOF
) > "%outputFile%"

echo Created mock PDF at %outputFile%
exit /b 0

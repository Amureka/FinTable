#Requires -Version 7.4
param(
    [string] $SdkRoot = $env:ANDROID_HOME,
    [string] $JdkRoot = $env:JAVA_HOME
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true

if (-not $SdkRoot) { throw 'Set ANDROID_HOME or pass -SdkRoot.' }
if (-not $JdkRoot) { throw 'Set JAVA_HOME or pass -JdkRoot.' }

$project = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$sdk = (Resolve-Path -LiteralPath $SdkRoot).Path
$jdk = (Resolve-Path -LiteralPath $JdkRoot).Path
$tools = Join-Path $sdk 'build-tools/35.0.1'
$androidJar = Join-Path $sdk 'platforms/android-35/android.jar'
$java = Join-Path $jdk 'bin/java.exe'
$javac = Join-Path $jdk 'bin/javac.exe'
$jar = Join-Path $jdk 'bin/jar.exe'
$keytool = Join-Path $jdk 'bin/keytool.exe'
$aapt2 = Join-Path $tools 'aapt2.exe'
$zipalign = Join-Path $tools 'zipalign.exe'
$d8 = Join-Path $tools 'lib/d8.jar'
$apksigner = Join-Path $tools 'lib/apksigner.jar'

foreach ($requiredPath in @($androidJar, $java, $javac, $jar, $keytool, $aapt2, $zipalign, $d8, $apksigner)) {
    if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
        throw "Missing Android build tool or SDK file: $requiredPath"
    }
}

$build = [IO.Directory]::CreateDirectory((Join-Path $PSScriptRoot 'build')).FullName
$signing = [IO.Directory]::CreateDirectory((Join-Path $PSScriptRoot '.signing')).FullName
$key = Join-Path $signing 'local-debug.jks'
$output = Join-Path $build 'FinTable.apk'
$stage = Join-Path $build ([Guid]::NewGuid().ToString('N'))

try {
    $classes = [IO.Directory]::CreateDirectory((Join-Path $stage 'classes')).FullName
    $dex = [IO.Directory]::CreateDirectory((Join-Path $stage 'dex')).FullName
    $appAssets = Join-Path $stage 'assets/app'
    $resources = Join-Path $stage 'resources.zip'
    $unsigned = Join-Path $stage 'unsigned.apk'
    $aligned = Join-Path $stage 'aligned.apk'
    $signed = Join-Path $stage 'signed.apk'

    Push-Location $project
    $previousMockMode = $env:VITE_USE_MOCK
    $previousApiUrl = $env:VITE_API_URL
    try {
        $env:VITE_USE_MOCK = 'true'
        $env:VITE_API_URL = ''
        npm run build -- --outDir $appAssets
    } finally {
        $env:VITE_USE_MOCK = $previousMockMode
        $env:VITE_API_URL = $previousApiUrl
        Pop-Location
    }

    & $aapt2 compile --dir (Join-Path $PSScriptRoot 'res') -o $resources
    & $aapt2 link -I $androidJar --manifest (Join-Path $PSScriptRoot 'AndroidManifest.xml') -o $unsigned $resources
    & $javac --release 8 -classpath $androidJar -d $classes (Join-Path $PSScriptRoot 'MainActivity.java')
    $classFiles = @(Get-ChildItem -LiteralPath $classes -Recurse -Filter '*.class' | ForEach-Object FullName)
    & $java -cp $d8 com.android.tools.r8.D8 --lib $androidJar --min-api 26 --output $dex @classFiles
    # jar uses forward slashes for APK entries when packaging assets on Windows.
    & $jar --update --file $unsigned -C $dex classes.dex -C $stage assets
    & $zipalign -f 4 $unsigned $aligned

    if (-not (Test-Path -LiteralPath $key)) {
        & $keytool -genkeypair -keystore $key -storetype JKS -storepass android -keypass android -alias androiddebugkey -dname 'CN=FinTable Local Debug,O=FinTable,C=US' -keyalg RSA -keysize 2048 -validity 10000
    }
    & $java -jar $apksigner sign --ks $key --ks-key-alias androiddebugkey --ks-pass pass:android --key-pass pass:android --v4-signing-enabled false --out $signed $aligned
    & $java -jar $apksigner verify --verbose $signed
    & $zipalign -c 4 $signed
    Move-Item -LiteralPath $signed -Destination $output -Force
    Write-Output "APK: $output"
} finally {
    if (Test-Path -LiteralPath $stage) {
        $resolvedStage = (Resolve-Path -LiteralPath $stage).Path
        if ((Split-Path -Parent $resolvedStage) -ne $build) { throw 'Unexpected staging path.' }
        Remove-Item -LiteralPath $resolvedStage -Recurse -Force
    }
}

# Сборка FinTable для Android

APK содержит веб-сборку FinTable и открывает её в системном WebView. Приложение работает офлайн и хранит данные на устройстве. Для установки подходит Android 8.0 или новее с обновлённым Android System WebView.

## Подготовка

- Windows и PowerShell 7.4 или новее.
- Node.js 22 или новее с npm.
- JDK 17 или новее.
- В Android SDK Manager установите Android SDK Platform 35 и Android SDK Build-Tools 35.0.1. Для установки через ADB также понадобятся Android SDK Platform-Tools.

## Сборка и установка

Из корня репозитория выполните в PowerShell:

```powershell
npm ci
./android/build.ps1
```

Скрипт ищет Android SDK в `ANDROID_HOME`, а JDK в `JAVA_HOME`. Пути можно передать явно:

```powershell
./android/build.ps1 -SdkRoot 'C:\Android\Sdk' -JdkRoot 'C:\Java\jdk-17'
```

Готовый подписанный APK появится в `android/build/FinTable.apk`. Его можно установить с файла на устройстве или через ADB:

```powershell
adb install -r ./android/build/FinTable.apk
```

## Следующие версии

Обновите `android:versionName` и увеличьте `android:versionCode` в `AndroidManifest.xml`, затем повторите сборку. Для обновления установленного приложения сохраните прежнее имя пакета `app.fintable.local` и тот же ключ подписи.

При первой сборке скрипт создаёт локальный отладочный ключ в `android/.signing/local-debug.jks`. Сохраните резервную копию этого файла для будущих обновлений. Для распространения через магазин потребуется отдельная подпись релиза.

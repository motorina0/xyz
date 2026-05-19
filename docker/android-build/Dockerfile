ARG NODE_IMAGE=node:24-trixie
FROM ${NODE_IMAGE}

ARG ANDROID_CMDLINE_TOOLS_ZIP=commandlinetools-linux-14742923_latest.zip
ARG ANDROID_BUILD_TOOLS=35.0.0
ARG ANDROID_PLATFORM=android-36

ENV DEBIAN_FRONTEND=noninteractive
ENV ANDROID_HOME=/opt/android-sdk
ENV ANDROID_SDK_ROOT=/opt/android-sdk
ENV ANDROID_BUILD_TOOLS_VERSION=${ANDROID_BUILD_TOOLS}
ENV PATH=${PATH}:${ANDROID_HOME}/cmdline-tools/latest/bin:${ANDROID_HOME}/platform-tools:${ANDROID_HOME}/build-tools/${ANDROID_BUILD_TOOLS_VERSION}

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    git \
    libc6-i386 \
    lib32stdc++6 \
    openjdk-21-jdk \
    unzip \
    wget \
  && rm -rf /var/lib/apt/lists/*

RUN mkdir -p ${ANDROID_SDK_ROOT}/cmdline-tools \
  && wget -q https://dl.google.com/android/repository/${ANDROID_CMDLINE_TOOLS_ZIP} -O /tmp/android-commandline-tools.zip \
  && mkdir -p /tmp/android-commandline-tools \
  && unzip -q /tmp/android-commandline-tools.zip -d /tmp/android-commandline-tools \
  && mv /tmp/android-commandline-tools/cmdline-tools ${ANDROID_SDK_ROOT}/cmdline-tools/latest \
  && rm -rf /tmp/android-commandline-tools /tmp/android-commandline-tools.zip \
  && yes | sdkmanager --sdk_root=${ANDROID_SDK_ROOT} --licenses >/dev/null \
  && sdkmanager --sdk_root=${ANDROID_SDK_ROOT} \
    "build-tools;${ANDROID_BUILD_TOOLS}" \
    "platform-tools" \
    "platforms;${ANDROID_PLATFORM}"

WORKDIR /workspace

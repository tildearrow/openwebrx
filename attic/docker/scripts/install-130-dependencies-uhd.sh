#!/bin/bash
set -euo pipefail

function cmakebuild() {
  cd $1
  if [[ ! -z "${2:-}" ]]; then
    git checkout $2
  fi
  mkdir build
  cd build
  cmake ..
  make
  make install
  cd ../..
  rm -rf $1
}

cd /tmp

STATIC_PACKAGES="libusb-1.0.0 libboost-chrono1.74.0 libboost-date-time1.74.0 libboost-filesystem1.74.0 libboost-program-options1.74.0 libboost-regex1.74.0 libboost-test1.74.0 libboost-serialization1.74.0 libboost-thread1.74.0 libboost-system1.74.0 python3-numpy python3-mako"
BUILD_PACKAGES="git cmake make gcc g++ libusb-1.0-0-dev libboost-dev libboost-chrono-dev libboost-date-time-dev libboost-filesystem-dev libboost-program-options-dev libboost-regex-dev libboost-test-dev libboost-serialization-dev libboost-thread-dev libboost-system-dev"

if [[ -z ${1:-} ]]; then
  apt-get update
  apt-get -y install --no-install-recommends $STATIC_PACKAGES $BUILD_PACKAGES

  git clone https://github.com/EttusResearch/uhd.git
  mkdir -p uhd/host/build
  cd uhd/host/build
  git checkout v4.1.0.4
  # see https://github.com/EttusResearch/uhd/issues/350
  case `uname -m` in
    arm*)
      cmake -DCMAKE_BUILD_TYPE=Release -DENABLE_UTILS=OFF -DENABLE_PYTHON_API=OFF -DENABLE_EXAMPLES=OFF -DENABLE_TESTS=OFF -DENABLE_OCTOCLOCK=OFF -DENABLE_MAN_PAGES=OFF -DSTRIP_BINARIES=ON \
            -DCMAKE_CXX_FLAGS:STRING="-march=armv7-a -mfloat-abi=hard -mfpu=neon -mtune=cortex-a8 -Wno-psabi" \
              -DCMAKE_C_FLAGS:STRING="-march=armv7-a -mfloat-abi=hard -mfpu=neon -mtune=cortex-a8 -Wno-psabi" \
            -DCMAKE_ASM_FLAGS:STRING="-march=armv7-a -mfloat-abi=hard -mfpu=neon -mtune=cortex-a8 -g" ..
      ;;
    aarch64*)
      cmake -DCMAKE_BUILD_TYPE=Release -DENABLE_UTILS=OFF -DENABLE_PYTHON_API=OFF -DENABLE_EXAMPLES=OFF -DENABLE_TESTS=OFF -DENABLE_OCTOCLOCK=OFF -DENABLE_MAN_PAGES=OFF -DSTRIP_BINARIES=ON \
            -DCMAKE_CXX_FLAGS:STRING="-march=armv8-a -mtune=cortex-a72 -Wno-psabi" \
              -DCMAKE_C_FLAGS:STRING="-march=armv8-a -mtune=cortex-a72 -Wno-psabi" \
            -DCMAKE_ASM_FLAGS:STRING="-march=armv8-a -mtune=cortex-a72 -g" ..
      ;;
    x86_64)
      cmake -DCMAKE_BUILD_TYPE=Release -DENABLE_UTILS=OFF -DENABLE_PYTHON_API=OFF -DENABLE_EXAMPLES=OFF -DENABLE_TESTS=OFF -DENABLE_OCTOCLOCK=OFF -DENABLE_MAN_PAGES=OFF -DSTRIP_BINARIES=ON ..
      ;;
  esac
  MAKEFLAGS="-j2" make
  make install
  cd ../../..
  rm -rf uhd

  git clone https://github.com/pothosware/SoapyUHD.git
  cmakebuild SoapyUHD soapy-uhd-0.4.1
fi

if [[ -z ${FULL_BUILD:-} || ${1:-} == 'clean' ]]; then
  echo "Cleaning from $0"
  SUDO_FORCE_REMOVE=yes apt-get -y purge --autoremove $BUILD_PACKAGES
  if [[ -z ${FULL_BUILD:-} ]]; then
    apt-get clean
    rm -rf /var/lib/apt/lists/*
  fi
fi

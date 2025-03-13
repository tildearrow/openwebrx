#!/bin/bash
set -euxo pipefail

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

STATIC_PACKAGES="libusb-1.0.0"
BUILD_PACKAGES="git libusb-1.0.0-dev cmake make gcc g++ pkg-config libtool"

if [[ -z ${1:-} ]]; then
  apt-get update
  apt-get -y install --no-install-recommends $STATIC_PACKAGES $BUILD_PACKAGES

  git clone https://github.com/rtlsdrblog/rtl-sdr-blog.git
  cmakebuild rtl-sdr-blog master

  git clone https://github.com/merbanan/rtl_433.git
  cd rtl_433
  mkdir build
  cd build
  cmake .. -DENABLE_SOAPYSDR=AUTO -DENABLE_RTLSDR=AUTO
  make
  make install
  cd ../../
  rm -rf rtl_433
fi

if [[ -z ${FULL_BUILD:-} || ${1:-} == 'clean' ]]; then
  echo "Cleaning from $0"
  apt-get -y purge --autoremove $BUILD_PACKAGES
  if [[ -z ${FULL_BUILD:-} ]]; then
    apt-get clean
    rm -rf /var/lib/apt/lists/*
  fi
fi

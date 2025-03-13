#!/usr/bin/env bash
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

BUILD_PACKAGES="git cmake make gcc g++ libsamplerate-dev libfftw3-dev"

if [[ -z ${1:-} ]]; then
  apt-get update
  apt-get -y install --no-install-recommends $BUILD_PACKAGES

  git clone https://github.com/luarvique/owrx_connector.git
  cmakebuild owrx_connector master
fi

if [[ -z ${FULL_BUILD:-} || ${1:-} == 'clean' ]]; then
  echo "Cleaning from $0"
  apt-get -y purge --autoremove $BUILD_PACKAGES
  if [[ -z ${FULL_BUILD:-} ]]; then
    apt-get clean
    rm -rf /var/lib/apt/lists/*
  fi
fi

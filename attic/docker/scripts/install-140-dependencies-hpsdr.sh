#!/bin/bash
set -euxo pipefail

BUILD_PACKAGES="git wget gcc libc6-dev"

if [[ -z ${1:-} ]]; then
  apt-get update
  apt-get -y install --no-install-recommends $BUILD_PACKAGES

  pushd /tmp

  ARCH=$(uname -m)
  GOVERSION=1.15.5

  case ${ARCH} in
    x86_64)
      PACKAGE=go${GOVERSION}.linux-amd64.tar.gz
      ;;
    armv*)
      PACKAGE=go${GOVERSION}.linux-armv6l.tar.gz
      ;;
    aarch64)
      PACKAGE=go${GOVERSION}.linux-arm64.tar.gz
      ;;
  esac

  wget https://golang.org/dl/${PACKAGE}
  tar xfz $PACKAGE

  git clone https://github.com/jancona/hpsdrconnector.git
  pushd hpsdrconnector
  git checkout v0.6.1
  /tmp/go/bin/go build
  install -m 0755 hpsdrconnector /usr/local/bin
  popd

  rm -rf hpsdrconnector
  rm -rf go
  rm -rf ~/go ~/.cache
  rm $PACKAGE
fi

if [[ -z ${FULL_BUILD:-} || ${1:-} == 'clean' ]]; then
  echo "Cleaning from $0"
  apt-get -y purge --autoremove $BUILD_PACKAGES
  if [[ -z ${FULL_BUILD:-} ]]; then
    apt-get clean
    rm -rf /var/lib/apt/lists/*
  fi
fi

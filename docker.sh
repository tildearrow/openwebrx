#!/usr/bin/env bash
set -euo pipefail

export DH_PROJECT="openwebrxplus"
export DH_USERNAME="slechev"

export NIGHTLY_BUILD=$(date +%F)

ARCH=$(uname -m)

#IMAGES="${DH_PROJECT}-rtlsdr ${DH_PROJECT}-sdrplay ${DH_PROJECT}-hackrf ${DH_PROJECT}-airspy ${DH_PROJECT}-rtlsdr-soapy ${DH_PROJECT}-plutosdr ${DH_PROJECT}-limesdr ${DH_PROJECT}-soapyremote ${DH_PROJECT}-perseus ${DH_PROJECT}-fcdpp ${DH_PROJECT}-radioberry ${DH_PROJECT}-uhd ${DH_PROJECT}-rtltcp ${DH_PROJECT}-runds ${DH_PROJECT}-hpsdr ${DH_PROJECT}-bladerf ${DH_PROJECT}-full ${DH_PROJECT}"
IMAGES="${DH_PROJECT}-full ${DH_PROJECT}"

ALL_ARCHS="x86_64 armv7l aarch64"
TAG=${TAG:-"latest"}
ARCHTAG="${TAG}-${ARCH}"

usage () {
  echo "Usage: ${0} [command]"
  echo "Available commands:"
  echo "  help       Show this usage information"
  echo "  build      Build all docker images"
  echo "  push       Push built docker images to the docker hub"
  echo "  manifest   Compile the docker hub manifest (combines arm and x86 tags into one)"
  echo "  tag        Tag a release"
}

build () {
  # build the base images
  echo -ne "\n\nBuilding the base image.\n\n"
  time docker build --pull -t ${DH_PROJECT}-base:${ARCHTAG} -f docker/Dockerfiles/Dockerfile-base .

  # AF: uncomment next 2 lines if you're building all images
  #echo -ne "\n\nBuilding soapysdr image.\n\n"
  #docker build --build-arg ARCHTAG=${ARCHTAG} --build-arg PROJECT=${DH_PROJECT} -t ${DH_PROJECT}-soapysdr-base:${ARCHTAG} -f docker/Dockerfiles/Dockerfile-soapysdr .

  for image in ${IMAGES}; do
    i=$(echo ${image} | rev | cut -d- -f1 | rev)
    # "openwebrx" is a special image that gets tag-aliased later on
    if [[ ! -z "${i}" && "${i}" != "${DH_PROJECT}" ]] ; then
      echo -ne "\n\nBuilding ${i} image.\n\n"
      docker build --build-arg ARCHTAG=$ARCHTAG --build-arg PROJECT=${DH_PROJECT} -t ${DH_USERNAME}/${image}:${ARCHTAG} -f docker/Dockerfiles/Dockerfile-${i} .
    fi
  done

  # tag openwebrx alias image
  docker tag ${DH_USERNAME}/${DH_PROJECT}-full:${ARCHTAG} ${DH_USERNAME}/${DH_PROJECT}:${ARCHTAG}
  docker tag ${DH_USERNAME}/${DH_PROJECT}-full:${ARCHTAG} ${DH_USERNAME}/${DH_PROJECT}-full
  docker tag ${DH_USERNAME}/${DH_PROJECT}-full ${DH_USERNAME}/${DH_PROJECT}-nightly:${NIGHTLY_BUILD}
  docker tag ${DH_USERNAME}/${DH_PROJECT}-full ${DH_USERNAME}/${DH_PROJECT}-nightly
}

push () {
  #for image in ${IMAGES}; do
  #  docker push ${DH_USERNAME}/${image}:${ARCHTAG}
  #done
  docker push ${DH_USERNAME}/${DH_PROJECT}-nightly:${NIGHTLY_BUILD}
  docker push ${DH_USERNAME}/${DH_PROJECT}-nightly
}

manifest () {
  for image in ${IMAGES}; do
    # there's no docker manifest rm command, and the create --amend does not work, so we have to clean up manually
    rm -rf "${HOME}/.docker/manifests/docker.io_${DH_USERNAME}_${image}-${TAG}"
    IMAGE_LIST=""
    for a in ${ALL_ARCHS}; do
      IMAGE_LIST="${IMAGE_LIST} ${DH_USERNAME}/${image}:${TAG}-${a}"
    done
    docker manifest create ${DH_USERNAME}/${image}:${TAG} ${IMAGE_LIST}
    docker manifest push --purge ${DH_USERNAME}/${image}:${TAG}
  done
}

tag () {
  if [[ -x ${1:-} || -z ${2:-} ]] ; then
    echo "Usage: ${0} tag [SRC_TAG] [TARGET_TAG]"
    return
  fi

  local SRC_TAG=${1}
  local TARGET_TAG=${2}

  for image in ${IMAGES}; do
    # there's no docker manifest rm command, and the create --amend does not work, so we have to clean up manually
    rm -rf "${HOME}/.docker/manifests/docker.io_${DH_USERNAME}_${image}-${TARGET_TAG}"
    IMAGE_LIST=""
    for a in ${ALL_ARCHS}; do
      docker pull ${DH_USERNAME}/${image}:${SRC_TAG}-${a}
      docker tag ${DH_USERNAME}/${image}:${SRC_TAG}-${a} ${DH_USERNAME}/${image}:${TARGET_TAG}-${a}
      docker push ${DH_USERNAME}/${image}:${TARGET_TAG}-${a}
      IMAGE_LIST="${IMAGE_LIST} ${DH_USERNAME}/${image}:${TARGET_TAG}-${a}"
    done
    docker manifest create ${DH_USERNAME}/${image}:${TARGET_TAG} ${IMAGE_LIST}
    docker manifest push --purge ${DH_USERNAME}/${image}:${TARGET_TAG}
    docker pull ${DH_USERNAME}/${image}:${TARGET_TAG}
  done
}

dev () {
  if [[ -z ${1:-} ]] ; then
    echo "Usage: ${0} dev [ImageId]"; echo; echo;
    docker image ls
    return
  fi
  docker run --rm -it --entrypoint /bin/bash -p 8073:8073 --device /dev/bus/usb ${1}
}

run () {
  docker run --rm -it -p 8073:8073 --device /dev/bus/usb openwebrxplus-full:latest-x86_64
}

case ${1:-} in
  build)
    build
    ;;
  push)
    push
    ;;
  manifest)
    manifest
    ;;
  tag)
    tag ${@:2}
    ;;
  dev)
    dev ${@:2}
    ;;
  run)
    run
    ;;
  *)
    usage
    ;;
esac

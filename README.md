Release Manager
===================
[![Build Status](https://travis-ci.org/hollowverse/release-manager.svg?branch=master)](https://travis-ci.org/hollowverse/release-manager)

Release Manager routes new sessions on https://hollowverse.com to different versions of the website in order to test code changes in a production environment on a small percentage of sessions before the changes land on `master`.

It can also be used to preview code changes before they are ready for production.

## How it works

### Traffic splitting
Release Manager implements cookie-based traffic splitting.

Each environment, including `master`, is assigned a numerical value that indicates the weight of that environment, i.e. how many sessions are routed to that environment relative to the other ones.

The values are set in [src/trafficSplitter/environments.ts](src/trafficSplitter/environments.ts).

A new session is assigned an environment picked at random, while still ensuring that the assignments respect the configured weight values.

The name of the new environment is stored in a cookie and read on subsequent requests, so once a user is routed to one environment, all subsequent pages are served from the same environment until the cookie expires.

### Previewing internal branches
When Release Manager receives a request, it looks in the URL for a query string field named `branch`. If the field exists, and has a value that matches one of the already-deployed [AWS EB environments](https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/using-features.managing.html) for the intended application, it routes the request to that environment. This can be used to preview branches that are not ready to be merged to a production environment.

A cookie is set to persist the routing for the user session so that subsequent requests do not have to set the `branch` field for the lifetime of the cookie. This cookie will always override the one that is used for [traffic splitting](#traffic-splitting). When that cookie expires or is deleted, the user is routed back to the environment specified in the traffic splitting cookie.

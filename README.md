Release Manager
===================

Release Manager routes new sessions on https://hollowverse.com to different versions of the website in order to test code changes in a production environment on a small percentage of sessions before the changes land on `master`.

## How it works
Release Manager implements cookie-based traffic splitting.

Each environment, including `master`, is assigned a numerical value that indicates the weight of that environment, i.e. how many sessions are routed to that environment relative to the other ones.

The values are set in [src/environments.ts](src/environments.ts).

A new session is assigned an environment picked at random, while still ensuring that the assignments respect the configured weight values.

The name of the new environment is stored in a cookie and read on subsequent requests, so once a user is routed to one environment, all subsequent pages are served from the same environment until the cookie expires.


# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Members find people and Meetups within their Organisation. Organisation Admins manage their population and Events. Platform Admins configure Organisations and deployment settings.

## Product purpose

Help Members meet through shared Interests, complementary Shares and Seeks, and overlapping Availability. A Connection records that two Members actually met.

## Capabilities and constraints

Use the vocabulary in CONTEXT.md and the decisions in docs/adr/. Organisations remain sealed by default. Meetups have Hosts, Participants and capacity. Events require Organisation Admin approval or creation. Scout reads authorised information and cannot act for a Member.

The existing Next.js application owns authentication and application behaviour. Design mockups use fictional data and temporary browser state. The requested comparison covers the full app, including administration.

## Brand commitments

The product name is Organisation Meetups. The user supplied two Habitect property interface references and requested a similar degree of composition, shape and styling. They explicitly reject the usual Meetup and Luma aesthetic. No final visual direction has been selected.

## Evidence on hand

CONTEXT.md, README.md, docs/adr/, GitHub issue #1 and existing routes describe the implemented product. The supplied images establish a visual reference, not new product capabilities. Mockup photographs are illustrative and do not represent actual Sites or Members.

## Open decisions

Choose a visual direction after comparing interactive browser mockups. Production rollout follows that choice.

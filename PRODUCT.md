# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Members find people and Meetups within their Organisation. Organisation Admins manage their population and Events. Platform Admins configure Organisations and deployment settings.

## Product purpose

Help Members meet through shared Interests, complementary Shares and Seeks, and overlapping Availability. A Connection records that two Members actually met.

## Capabilities and constraints

Use the vocabulary in CONTEXT.md and decisions in docs/adr/. Organisations remain sealed by default. Meetups have Hosts, Participants and capacity. Events require Organisation Admin approval or creation. Scout reads authorised information and cannot act for a Member.

The existing application owns authentication, permissions, validation and persisted actions. The design covers the full app, including Organisation Admin and Platform Admin.

## Brand commitments

The product name is Organisation Meetups. The user chose Atrium after comparing three interactive prototypes. Atrium uses warm stone framing, ivory panels, charcoal controls, Manrope and broad photography. The supplied Habitect screenshots informed the design. The user rejects the usual Meetup and Luma aesthetic.

## Evidence on hand

The accepted prototype is preserved at commit 6b29786 on feat/ui-style-mockups and in draft PR #43. Its fictional people and records are demonstration data. Production pages use authorised application data. Stock photographs illustrate Activities and do not depict actual Sites, Hosts or Participants.

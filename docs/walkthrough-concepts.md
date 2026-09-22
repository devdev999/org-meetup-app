# Mobile walkthrough concepts

The central idea is workplace friendship. Help Members meet people they already work alongside but rarely speak to. Hobbies provide an easy first conversation, and repeated Meetups provide a reason to meet again.

The proposed film title is **The colleague you haven't met yet**. A possible opening line is, "You know their Programme Centre. Do you know their favourite plot twist?"

All people, gatherings and the team origin story are fictional. The phone captures show the running app with [DSTA demo data](./demo-data.md). The app is a responsive web app, not a native mobile application.

## Preview choices

| Preview | Perspective | What it tests |
| --- | --- | --- |
| A. The lunch that started it | Three fictional colleagues meet over lunch, discuss a favourite TV drama and sketch a way for more people to meet across Programme Centres. | Whether the team's human motivation makes the product memorable. |
| B. Your first familiar face | A fictional new joiner uses her phone to find a lunchtime conversation and people with shared Interests. | Whether one clear Member journey makes the value easy to understand. |
| C. From shared interests to real connections | A shared Interest leads to a Meetup, then confirmed Attendance and Connection history. | Whether the technical choices strengthen the social story. |

Each preview is a 45-second concept edit with a short generated opening, real mobile screenshots, narration and captions. They establish story, pace and visual treatment before the final film. The final cut should use real recordings for taps and state changes.

## Recommended three-minute cut

Combine A's origin story, B's mobile journey and C's technical proof. Keep the phone interface readable and give each meaningful action time to register.

| Time | Story and visual | Judging question |
| --- | --- | --- |
| 0:00 to 0:15 | People in different Programme Centres share the same interest but have never spoken. An empty chair at lunch gives the film a recurring image. | What problem are you solving? |
| 0:15 to 0:35 | In the fictional brainstorm, colleagues discuss useful ideas for DSTA. A debate about a TV ending reveals a simple starting point, a reason to say hello. | Why did you build it? |
| 0:35 to 0:50 | Reveal Organisation Meetups on a phone. Explain that Members find common Interests and arrange to meet within their Organisation. | What did you build? |
| 0:50 to 1:20 | Add a Hobby and a Skill, show Shares and Seeks, read an actual Suggestion reason, open a lunch Meetup and join. | How does your solution address it? Show key features. |
| 1:20 to 1:45 | Show suggested invitees across Departments, a same-day Availability overlap, and an approved Organisation Event. Keep hobbies and friendship central. | What makes it different? Show key features. |
| 1:45 to 2:10 | Mark a clear jump to a past demo Meetup. Show confirmed Attendance and the resulting Connections, then a recurring Meetup and RSVP. | Show how people can meet again. |
| 2:10 to 2:35 | Demonstrate Scout through a working provider and explain its read-only access checks. Briefly show a full Meetup and its ordered waitlist. | What is technically interesting? |
| 2:35 to 2:50 | Explain the Organisation roster, Department context and reasoned Suggestions. Show separate Organisations and label cross-Organisation gatherings as a future direction. | What makes it different? |
| 2:50 to 3:00 | Return to the lunch table as someone takes the empty chair. Close with the app on a phone and an invitation to meet a new face. | Reinforce the intended benefit. |

## Positioning and claim checks

Luma already supports company calendars, private events, registration approval and waitlists. Meetup supports private groups. Do not claim that restricting an event to colleagues is unique. The pitch is the combination of an Organisation's roster, Department context, Interests, explainable Suggestions, Availability and recorded encounters, designed around ordinary working days. This is a product positioning judgement, not an exhaustive competitive claim. [Luma event creation](https://help.luma.com/p/creating-an-event), [Meetup group visibility](https://help.meetup.com/hc/en-us/articles/360002921751-Key-differences-between-Public-Groups-and-Private-Groups).

Invite Suggestions rank Interest relevance first, then can favour a new face and another Department. Home Suggestions use Interest relevance, fewer recorded Connections with Participants and time. Connections record confirmed co-Attendance. They do not measure friendship or morale.

The platform supports separate Organisations today. Cross-Organisation Site and Event sharing is future work under [ADR 0002](./adr/0002-organisations-sealed-by-default.md). Do not imply an actual DSTA identity integration, government certification, government-wide access or a measured organisational impact. Scout cannot join, create or invite. The local memory AI provider gives simulated responses, so label that if it appears in footage.

## Production handoff

The recording viewport is 390 by 844 CSS pixels at device scale factor two. The previews use these portrait captures inside a landscape film for judging. The local deployment's display time zone was set to Asia/Singapore for recording. Aisha's Photography Stance was changed to Seeks in the app to match the fictional new-joiner story. Joining and leaving the Severance Meetup were verified through the phone interface; its original seat count was restored for recording.

Higgsfield CLI 1.1.26 and eight companion skills were installed, and the Plus workspace was authenticated. The live catalogue offered Seedance 2.5. Three six-second 1080p shots cost 216 credits. A voice audition and three Seed Audio narrations cost a further 22.7 credits, leaving 771.3 of the original 1,010 credits for final production and revisions. These are this session's measured charges, not permanent price claims.

ElevenLabs accepted the supplied key but rejected library speech and voice design because the account required a paid plan. The previews therefore use an original narrator generated with a Singaporean female voice description through Seed Audio. ElevenLabs speech-to-text verified the spoken scripts and supplied word timings for captions. No credential is stored in the project.

Remotion assembles the phone captures, generated clips, titles, captions and narration. The live Higgsfield catalogue did not expose its documented explainer assembler, so final editing uses Remotion. The local production assets, renderer and full alternative storyboards live in the sibling `info-wars-preview` directory. Large generated media stays outside Git.

Sources: [DSTA Programme Centres](https://www.dsta.gov.sg/join-us/job-seeker), [Higgsfield CLI](https://github.com/higgsfield-ai/cli), [Higgsfield audio](https://higgsfield.ai/blog/higgsfield-audio), [Remotion renderer](https://www.remotion.dev/docs/renderer/render-media). App capabilities are documented in [README](../README.md) and [CONTEXT](../CONTEXT.md).

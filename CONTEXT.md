# Organisation Meetups

Staff of an organisation find colleagues who share their interests or can trade skills, and arrange to meet, in person or virtually. Serves many organisations, each with its own population.

## Language

### People and structure

**Organisation**:
A body whose staff form one population of Members, such as a ministry headquarters or an agency. Organisations are sealed from each other unless an admin explicitly shares something between them.
_Avoid_: company, tenant, workspace, org

**Ministry**:
A grouping of Organisations used to roll up reporting. Not a population in its own right.
_Avoid_: parent org, group, cluster

**Member**:
A person in an Organisation who can use the app. A Member is Provisioned until their first login, Active after it, Suspended if an admin removes their access, and Departed once they leave the Organisation.
_Avoid_: user, employee, colleague, staff member

**Department**:
The unit within an Organisation that a Member belongs to. A filter and a matching signal, never a boundary on who may meet.
_Avoid_: team, division, unit

**Site**:
A physical location where Members are based, such as a building or a campus. A Site belongs to one Organisation and can be shared with others.
_Avoid_: office, location, workplace

### Interests and matching

**Interest**:
Something a Member declares about themselves so others can be matched with them. Every Interest is a Skill or a Hobby, which is a category for browsing, and a Member holds it with a Stance, which is what matching uses.
_Avoid_: tag, topic, preference

**Skill**:
An Interest that is a learnable competence, such as SQL or public speaking.
_Avoid_: competency, expertise, capability

**Hobby**:
An Interest pursued for enjoyment, such as climbing or board games.
_Avoid_: pastime, activity

**Stance**:
How a Member holds an Interest: they Share it or they Seek it. Shares matches Shares and Seeks; Seeks also matches Seeks, as "learn together".
_Avoid_: level, role, direction

**Shares**:
The Member is into this Interest and will do it with, or help, others.
_Avoid_: offers, has, knows

**Seeks**:
The Member wants to learn or get into this Interest.
_Avoid_: wants, learning, interested in

**Alias**:
A raw phrase a Member typed that resolves to an Interest, such as "rustlang" for Rust. Interests are matched on, Aliases are only remembered.
_Avoid_: synonym, raw tag, variant

**Suggestion**:
The system proposing a Member to invite to a Meetup or Event, or a Meetup or Event for a Member to join, always with the reason: shared Interests, overlapping Availability, or a new face from another Department.
_Avoid_: match, recommendation, pairing

**Availability**:
A Member's declaration that they are up for an Activity in a time window, at a Site or virtually. A signal for finding company now, not a Meetup.
_Avoid_: status, free slot, presence

**Connection**:
A record that two Members have actually met through a Meetup or an Event. Used to prefer new faces in Suggestions and to show history.
_Avoid_: friend, mate, contact

**Scout**:
The read-only AI assistant a Member or admin can ask questions of. It reads only what the asker could see themselves and never acts on their behalf.
_Avoid_: assistant, chatbot, bot, AI

### Meeting

**Meetup**:
A get-together arranged by a Member: an Activity at a start time, at a Place, with a capacity. A recurring Meetup repeats on a schedule, and each occurrence is itself a Meetup.
_Avoid_: session, hangout, meeting, catch-up

**Event**:
A get-together run by the Organisation. Same shape as a Meetup, but proposed by a Member and approved by an Organisation Admin, or created by one directly. A recurring Event repeats the same way.
_Avoid_: official meetup, function, programme

**Activity**:
What a Meetup or Event is for, such as coffee, lunch, a walk or a game.
_Avoid_: type, category

**Place**:
Where a Meetup or Event happens: a spot at a Site, or a virtual room.
_Avoid_: location, venue, link, room

**Host**:
The Member who runs a Meetup or an Event and is responsible for it.
_Avoid_: organiser, owner, creator

**Participant**:
A Member who has joined a Meetup or an Event, whether through an Invite or by joining an open one.
_Avoid_: attendee, guest

**Invite**:
A named ask from a Member to a specific Member to join a Meetup or an Event. Distinct from one merely being open to join.
_Avoid_: invitation, request, nudge

**RSVP**:
A Participant's answer, going or not, for one occurrence of a recurring Meetup or Event. Joining a one-off counts as going.
_Avoid_: poll, response, headcount

**Attendance**:
The Host's record, after a Meetup or Event, of which Participants actually came. A Participant who said going but did not come is a no-show.
_Avoid_: check-in, turnout

### Administration and safety

**Platform Admin**:
A person who runs the whole platform: creates Organisations and sees reporting across them.
_Avoid_: super admin, root, operator

**Organisation Admin**:
A Member who manages one Organisation: its Departments, Sites, Interests, Events, reports and moderation.
_Avoid_: admin, HR admin, owner

**Block**:
One Member's standing instruction that another Member never sees them, is suggested to them, or shares a Meetup or Event with them, in both directions.
_Avoid_: mute, hide, ban

**Flag**:
A Member's complaint about a Member, a Meetup or an Event, sent to their Organisation Admin.
_Avoid_: report, complaint, ticket

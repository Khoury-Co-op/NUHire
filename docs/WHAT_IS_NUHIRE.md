# What is NUHire

For teaching the team what we're building and why. No code here.

---

## The one-line version

NUHire is a web app that runs a live, in-class hiring simulation for Khoury
CS1210. Students play the employer instead of the applicant.

## Why it exists

CS1210 is Northeastern's intro to co-op. Its job is to get first-years ready to
apply for their first co-op. For years it included an activity called **employer
for a day**: students got a printed job description and a stack of paper resumes,
and had to pick who to interview.

It worked. Students who have spent an hour rejecting resumes understand why
theirs gets rejected, and that lands harder than being told.

The problems were that it's paper, it doesn't scale, and the instructor can't see
what's happening. NUHire is that activity as software.

## Who uses it

**Students**, in groups of 3 to 5. They share a group and move through the
activity together.

**The professor**, running the class live from a control panel. They are not a
passive admin. During the activity they assign groups, start them, throw
curveballs, and approve or reject every offer. The app is a teaching instrument
being played in real time.

## The activity

Six steps. A group moves through them together, and several steps wait for
everyone in the group to finish before anyone continues.

**1. Job description.** The group is assigned a real co-op posting and reads it.
Everything after this is judged against it.

**2. Resume review, individual.** Each student reviews 10 resumes alone, on a
timer. Yes or no on each. The timer is deliberate, because real recruiters skim.

**3. Resume review, group.** The group compares picks and argues down to 4
candidates to interview. This is where the learning happens: you have to defend
why you cut someone.

**4. Interview stage.** The group watches short recorded interviews for their 4
candidates and rates the answers. This is where the professor throws curveballs,
like a candidate no-showing, and the group has to react.

**5. Make an offer.** The group picks one person and sends the offer to the
professor.

**6. Employer panel.** Intended as the debrief. Not built yet.

## What the professor does

**Before class:** export the roster from Canvas, upload it, assign students to
groups, download the group list, and import it into Zoom to pre-build breakout
rooms. Then assign each group a job.

**During class:** start the groups. Watch progress. Send curveballs once groups
reach the interview stage. Accept or reject each offer as it comes in.

Accepting or rejecting is roleplay, not grading. The professor is playing the
_candidate_ deciding whether to take the job. A rejection teaches that the
employer doesn't always get their first pick.

## Where it stands

Built by Khoury co-ops starting spring 2025 and extended through late 2025.
Everyone who wrote it has left. It was deployed to Khoury infrastructure in
spring 2026 and has sat since.

The core simulation genuinely works. Login, group management, all five real
steps, live sync between group members, the professor's control panel. That is
not a prototype.

What's missing is everything around it: no tests, no CI, stale docs, and it has
**never been run with more than two people**. The pilot is one real class of
about 30 students.

## What we're actually solving

Not "build a hiring simulation." That exists.

**Make it survive a real classroom.** Thirty students, one professor, fifty
minutes, no second chances. A bug here doesn't page an on-call engineer, it
derails a class in front of thirty people and the professor falls back to paper.

That reframes what matters. The scariest thing in the codebase isn't slow
queries, it's that a group can get permanently stuck waiting for a teammate who
went to the bathroom, and the professor has no button to unstick them.

## Who's who

| Who                    | Role                                                            |
| ---------------------- | --------------------------------------------------------------- |
| **Tori**               | Khoury co-op coordinator. Our client. Decides what it should do |
| **James**              | Tori's counterpart, knows the current technical state           |
| **Khoury Systems**     | Host and maintain the servers. No feature work                  |
| **AI Innovation Labs** | Ran the process that paired us with this project                |
| **Oasis**              | Us                                                              |

## The goal

Pilot-ready by end of fall. Spring 2027, one CS1210 section, ~30 students. The
professor gets to choose NUHire or paper, so it has to be good enough that
choosing it isn't a risk.

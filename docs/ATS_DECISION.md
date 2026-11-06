# ATS: which approach (OAS-244)

**Decision: keyword matching, against a short term list per job description.**
It is the only option that gives every group the same score for the same
resume, costs nothing per class, and sends no resume anywhere. HackerRank's
open-source tool is ruled out. An AI model was not tested: there is no Khoury
API key yet and no free model is installed. It stays a later option for
explaining a score, not for producing one.

The text this needs is extracted and stored by OAS-245 (#123).

## Khoury API key

Not yet requested at the time of writing. It is the slow step, so it should be
requested now, whatever we build first.

## HackerRank's tool: ruled out

It exists:
[interviewstreet/hiring-agent](https://github.com/interviewstreet/hiring-agent),
MIT licensed (© HackerRank). MIT lets us use, copy, modify and redistribute it,
provided the copyright and licence notice comes along. The licence is fine; the
fit is not:

- its README says it is "Not an ATS", and ships a demo config, not the one
  HackerRank uses
- it scores a resume against a fixed rubric for a role name, not against a job
  description, and groups in one class hire for different postings
- an LLM produces the score. One reviewer scored the same resume 100 times with
  its default local model and got 66 to 99
  ([Dan Unparsed](https://danunparsed.com/p/hackerrank-open-source-ats))
- it pulls the candidate's GitHub profile. Four of our ten fictional sample
  resumes list a GitHub URL, so it would score whoever owns those usernames
- it is a Python 3.11 CLI, a second runtime next to our Node API

It needs an LLM to run at all, so it was not run either.

## Compared on the 10 seeded resumes

A prototype keyword scorer, outside the repo, scored all 10 seeded resumes
against all 5 seeded job descriptions. It weights each word of a posting by how
specific it is to that posting, so words found in all five count for nothing.

- **Repeatable:** two runs gave identical scores; 100 scores took 9 ms.
- **Follows the job:** the 5 postings gave 5 different top-4 shortlists, and
  the top picks fit visibly. For Cygilant's security research co-op, Maya
  Collins ranks first on _cybersecurity, network, alerts, scripts_; for
  Motionlogic's QA co-op, Lucas Nyugen ranks first on _automation, Linux_.
- **Too noisy as raw words:** it also matched _boston, food, travel, fall_, the
  most-missed terms were equal-opportunity boilerplate (_accommodation_), and
  the best score in any posting was 14%. A student would read that as broken.

So the build should score against a curated list of 10 to 20 terms per posting
(skills, tools, degree), not every word in it. That is also how real ATS
screens work: a recruiter sets the keywords.

## Accuracy

There is no answer key: all five postings share the same 10 resumes, and the
professor's accept or reject is roleplay, not grading. Accuracy above means
repeatable and job-sensitive, which keyword matching is and an LLM score is
not. The real check is available later and stays in-house: compare its
shortlist with how students voted on the same resumes in past classes.

## Cost

- **Keyword matching:** nothing. It runs in the API in milliseconds.
- **AI model:** about 1,500 input tokens per resume and posting pair (a resume
  is ~470, a posting ~740, plus instructions), so ~75k tokens to score all 50
  pairs once, cached until a PDF changes. The price depends on the model behind
  the Khoury key. The bigger cost is a quota or outage in the middle of a class.
- **`hiring-agent`:** the same LLM cost over several calls per resume, plus
  GitHub API calls; or a server that can run a local model.

## What data leaves our servers

- **Keyword matching:** nothing.
- **AI model:** the resume and job description text, to whichever provider sits
  behind the Khoury key. Our samples are fictional, but a professor can upload
  real people's resumes.
- **`hiring-agent`:** the same text to its LLM (unless run on a local model),
  and the candidate's GitHub username to GitHub.

## Next

1. Request the Khoury API key.
2. Build keyword matching over the stored text, with a term list per job
   description and the matched and missing terms shown to students.
3. Revisit AI for "explain this score" once the key exists.

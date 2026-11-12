> **ARCHIVED, DO NOT FOLLOW.**
> Written ~Sept 2025. Describes a Render + Railway deployment and Google OAuth,
> neither of which the code uses. Kept for history only.
> Current setup: [ONBOARDING.md](../../ONBOARDING.md).

---

# System Overview

## Design Goals and Constraints

- Support multiple simultaneous user sessions
- Provide real-time collaboration between students in the same group
- Ensure responsive design for various devices
- Support secure user authentication
- Enable advisors to monitor student progress
- Allow dynamic content assignment (job descriptions, resumes, interviews)

## Frontend

Primarily everything works using Next.js and Tailwind for the css.

### Page tracking:

Two Components for static and active student page tracking respectively:

1. Uses local states to track the farthest page the student has been to, so that when they exit to the dashboard their page will still be visible and all the progress they have completed till now. Everything will reset when they click on the "complete simulation button" that is being implemented. Local storage has paths to the next page the student can go to and what pages they can advance and back up to, so that everything is kept in order and linear. Please check the [Use Progress](/frontend/src/app/components/useProgress.tsx) page to learn more information and the dashboard page for how the progress buttons are implemented.

2. Active tracking of the student user page, constantly updates the advisor by calling the backend and updating a column in the **Users table** specific to that student. So everytime a student changes pages, a api call is made and this updates the student's current page, this is so that the advisor can see at all times what pages the students are working in and can send approprite popups.

### PDF's and Videos:

**PDF and running into errors**

For the jobdescription page, we use react-pdf's pdfjs and document to display the pdf's to users. This is something to be careful about, as sometimes (a lot of times) during installation there might be multiple different versions of pdfjs installed, and this might throw errors when trying to run the page. In that case run:

```bash
cd frontend
npm list pdfjs-dist
```

and make sure that there is only one version and it exists inside the **frontend directory**.

To see this in action check: [Job description](/frontend/src/app/jobdes/page.tsx)

**Videos**

There are multiple places where we have found to use videos, in the beginning to show the ats video or for all the interviews in the interview stage. The best way to represent these videos is just to get the links off of youtube and just embedd them using IFrame.

To see this in action either check the student-dashboard or [Interview Page](/frontend/src/app/interview-stage/page.tsx)

**General notes**

All videos and pdfs are dyanmically fetched from the databse from their respective tables (Interview_vids and Resume_pdfs) this is done so because new resumes or job descriptions can be added by the advisor, and so calling them from the db makes it easier to just change them there and also link the resume indexes with the interview indexes so same resumes stay with same interviews and everything is consistent (final version of this db design in progres..).

### Web-Sockets:

We use web sockets for two big reasons with the help of Socket.IO.

**Popups**:

Students can get popups from the advisor at anytime, there are preset popups that have special abilities like blocking the students from performing certain actions, but most are just general reminders and other information that the advisor can send with whatever heading and infromation they would like. On the student side, every page has a popup listener so that it listens for if the popup is sent to that group and if so the popup is printed into the middle of the screen for all the students in that group, and multiple groups can also get the popup.

**Group resume review and interview review**:

Students have two stages while doing resume reviews and interview reviews. Each has an individual stage where they get to go through resumes and interviews and select the ones which they like and rate them. In the second stage they have to come together with their group, and this is where web sockets come in. Web sockets enable all the students with the same group id to come together in the same page and see what resumes or interviews other have selected and as a group select only 4 resumes or 1 candidate to send to the next stage or make offers to respectively. Websockets make it so that if one person clicks on one candidate that candidate is clicked for all the members in the group (similar to how one edit in the same google doc appears for everyone on that document).

Check both: [Resume review group](/frontend/src/app/res-review-group/page.tsx) and [Make Offer](/frontend/src/app/makeOffer/page.tsx) to see this specific web socket implemented.

## Backend

### Api

All of the api code, is stored in the [Server.js](/api/server.js) file.

The api directory controls everything between the frontend and the database. All of the Rest Api requests are processed here, the database is connected thorugh here, Google OAuth is setup here and also connection to Socket.IO is also set up here. Here are the important notes:

**Rest Api**

**Google OAuth**

**Socket connection**

### Database

We are using MySQL database to store and mangage student information and other information for the application. Inserted below is a picture of all the tables in use. (Might compress and delete some tables based on the usage).

![Screenshot](/project-screenshots/database_tables.png)

**Here is some important information to know about the database**

When new users signup from the landing page, we use google OAuth and the student's information, such as their First and Last name, their email that the logged in with, their affiliation as a student or advisor and their class number is stored in the _USERS_ table. **We don't store any passwords because everything is authenticated through google**.

After the user as signed up, everytime they log in with the same email, we get the user from the database with their email -- this way the user can log in and sign in with the same button. Based on if they're a student or Advisor they are directed to the Student Dashboard or the Advisor dashboard. The Advisor will be able to see all the students that are signed up for their specific class so other classes and students don't overlap. Below is a picture of the users table, some of the information is collected when users signup and other information is filled out as they go through the activity.

![Screenshot](/project-screenshots/database_usersTable.png)

As the users go through each page, every page has a table dedicated that stores specific information for that page. Here is a breakdown for the tables other than the Users table.

**Groups**:
Contians:

- id: Represents the "Group Number" when assigned by the advisor (primary key)
- group_name: name of the group

Purpose: Groups are created by the advisor for the purposes of simulating a real time hiring community, students in the group go throught he project together and make decisions about candidates.

**Notes**:
Contains:

- id: Represents the id of the note, which is auto-incremented.
- user_email: The email of the user who made the notes so their notes can be retrieved and identified when they log in.
- content: a text of the comments they made during the stage of the application
- created_at: auto-time stamp that records when the user made this note.

Purpose: Students can make throughout the process and these notes will persist throughout the application and everytime they log on, so these notes are stored in the database and retrieved when the student logs-in and accesses them.

**Job Description**:

- id: Represents the id of the jobdes, which is auto-incremented.
- student_id: the id of the student who visited it, students will be defined by their id and or email
- visited: the time they visited which will be auto stored
- time_spent: how long a student spent on the specific page, time variable set in the frontend

Purpose: Montiors who the student is and how long they spent on the job-description

**Job Descriptions**:
Contains:

- id: Represents the id of the job-descriptions, auto-incremented.
- title: Represents the title of the Job description (i.e. Amazon Webdev intern Job description)
- file_path: Represents the path to the file that contains the jobdes, which can be changed when advisor uploads new files
- uploaded_at: Time stamp of when this was uploaded.

Purpose: This table has all the Job descriptions, **this is different from Job Description**, this table contains all the job-descriptions that the advisor can assign to students and the other table stores information about when the student visits and goes through the job-description page.

**Candidates**:
Contains:

- id: id for the Candidates table, auto-incremented.
- resume_id: Represents the id of the resume
- interview: Represents the id of the interview.

Purpose: This will be further fine-tuned so that candidates with the resume will be connected to their interivew_id so that they are tightly coupled and each resume has an interview.

**Resume pdf's**:
Contains:

- id: Represents the id of the resume-pdfs, auto-incremented.
- title: Represents the title of the Resume (name of the candidate or for now just sample)
- file_path: Represents the path to the file that contains the resume_pdf.
- uploaded_at: Time stamp of when this was uploaded.

Purpose: This table contains all the resume_pdfs and will be used when the users have read the jobdescription and go to look at the resumes.

**Resume page**:
Contains:

- id: Represents the id of the resumePage, auto-incremented.
- visited: Represents when the user visited this page with the current time_stamp
- student_id: Represents the id of the student who visited this page
- timespent: Represents how long the student spent on the page, time variable stored in the frontend
- vote: Enum of: Yes, No, Unanswered. Represents the student's response to each seperate resume they look at.

Purpose: The table stores the user's responses to each resume.

**Interview Vids**:
Contains:

- id: Represents the id of the video, auto-incremented
- title: Represents the title of the Interview (ie. student name or for now sample)
- resume_id: connects to the resume, so they are coupled (will be fine-tuned to use the candidates table)
- video_path: path to the video (stored as links to youtube videos)
- uploaded_at: current time stamp as to when the video was uploaded

Purpose: Stores the interview videos that the users will watch based on the resumes they select to move onto the interview stage.

**Interview Page**
Contains:

- id: Represents the id of the interview page, auto-incremented
- student_id: Represents the id of the user who is completing this page
- group_id: Represents the group of the user
- question1: Scale from 1 - 10 of the user's response for the interview question
- question2: Scale from 1 - 10 of the user's response for the interview question
- question3: Scale from 1 - 10 of the user's response for the interview question
- question4: Scale from 1 - 10 of the user's response for the interview question
- timespent: time the user spent on this page
- candidate_id: different from the student_id, represents the id of the candidate that the user is interviewing (will be fine tuned and will reference the candidates table)

Purpose: This table stores the responses for users on the candidates that they interview based on a set of questions that they have to be looking for when intervewing the candidate and will provide a rating for those question from a scale of 1 - 10. Questions include (candidate posture, response clarity, creativeness, etc.)

**Make offer**
Contains:

- id:
- selected_candidate:
- timespent:
- group_id:

Purpose:

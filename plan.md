
### Nabisunsa Girls' Secondary School — Mobile School App

---

## 1. What Is This App?

NafAcademy is a **React Native (Expo)** mobile application built for **Nabisunsa Girls' Secondary School** in Uganda. It is a full-featured school management and e-learning platform designed to connect **administrators, teachers, students, and parents** on a single digital platform.

The app uses **Google Firebase** as its backend:
- **Firestore** — Cloud NoSQL database for all school data
- **Firebase Authentication** — User login and identity management
- **Firebase Storage** — File uploads (assignments, profile photos, lesson notes)

---

## 2. User Roles

The app supports **3 roles**, each with a distinct set of screens and permissions:

| Role | Access Level |
|------|-------------|
| **Admin** | Full access — manages all users, settings, fees, marks, and content |
| **Teacher** | Creates assignments, video lessons, enters marks, chats with students/parents |
| **Student** | Views lessons, submits assignments, checks marks, fees, and career path |
| **Parent** | parents use students accounts to view there childs performance, course and subject recommendations, and ongoing academic and skills available, and how best they can support there childs education

---

## 3. Core Modules & Features

### 🏠 Dashboard
The home screen for all users. Shows a personalised summary including:
- Upcoming assignment deadlines (colour-coded by urgency)
- Overall academic average percentage
- Unread notifications count
- Pending (ungraded) submissions
- Quick-action buttons: Watch Videos, Messages, Career Path, Students

---

### 📢 Announcements
School-wide notice board:
- Admins and teachers post announcements targetted at specific audiences (students, parents, teachers, or all)
- Announcements can be **pinned** to the top of the feed
- Real-time updates via Firestore listeners

---

### 🎬 Classroom (Video Lessons)
An in-app e-learning library:
- Teachers upload video lessons linked to a **subject, class, and topic**
- Videos are streamed from **Google Drive** file IDs
- Supports attached **PDF notes** and **image notes** per lesson
- Students can **comment** on videos; comment counts are tracked
- Students can **download** videos for offline access

---

### 📝 Assignments
Assignment management module:
- Teachers create assignments with a **title, subject, class, due date**, and type (`exercise`, `activity`, `exam`)
- Students can **upload submissions** (image or PDF) directly from their phone
- Teachers **grade submissions** with a score
- Students see pending vs graded submissions

---

### 📊 Performance (Marks)
Academic marks tracking:
- Teachers enter marks for **Beginning of Term (BOT), Mid Term, End of Term (EOT), and Assignments**
- Uses the **East African / Uganda grading scale**: A (80%+), B (70%+), C (60%+), D (50%+), E (40%+), O (30%+), F (below 30%) but most importantly the school can define their grading scale in the admin section.
- Students and parents can view all recorded marks per subject

---

### 📋 Bulk Marks Entry
A dedicated screen for teachers/admins to enter marks for an entire class at once:
- Select term, class, subject, and exam type
- Enter scores for all students in a single form
- Saves all marks in one batch operation
-Alternatively, a teacher can take a picture of the entire marksheet and since the app will have an AI powered OCR it will extract the marks and save them in the database.
---

### 📄 Report Card
Generates a comprehensive academic report per student per term:
- Summarises all marks across subjects
- Calculates grades and aggregate points using the Uganda grading scale
- Printable / shareable as a PDF

---

### 🚀 Career Path
An AI-guided career advisory tool for O-Level and A-Level students:
- Analyses a student's marks across all subjects
- **O-Level**: Recommends best A-Level subject combinations (e.g., PCM, MEG, HEK) based on performance
- **A-Level**: Calculates the UACE weight score and matches students to Ugandan universities and degree programmes
- we shall import the courses and for diffrent universities in Uganda and the cut off points and requirements and subject combinations that the system will compare with to give students and parents the best suggestions based on there performance and the school they are in. and for o-levels we will also recommend the best combinations for the school they are  depending on the subject combinations the school will have defined and the school will have to define.  

- Provides confidence scores (high / medium / low) per suggestion

---


---

### 💬 Chat (Messaging)
Private one-to-one messaging:
- Any user can start a conversation with any other user in the school
- Supports **text messages, images, PDFs, and audio** attachments
- Real-time updates with unread message counts per conversation

---

---

### 📁 Projects
Collaborative student project tracker:
- Teachers assign group projects to a set of students
- Tracks project **status**: `pending → in-progress → submitted → graded`
- Students upload project files (images, PDFs)
- Teachers grade the final submission with a score

---

### 🔔 Notifications
In-app notification centre:
- Automatically triggered by key events: new assignments, marks entered, submissions graded, new announcements
- Users can mark individual or all notifications as read

---

### 👥 Students (Admin/Teacher View)
Student roster management:
- Admins can view all students in the school
- Can create new student accounts (auto-generates login credentials)
- Filters by class

---

### ⚙️ Settings (Admin Only)
Full school configuration panel:
- **School Profile**: Edit school name, motto, logo, curriculum
- **Grading Weights**: Configure weighting for assignments, mid-term, and end-of-term exams
- **Terms**: Create and manage academic terms (Term 1, Term 2, Term 3)
- **Classes**: Create and manage class streams (S1–S6, O-Level / A-Level)
- **Subjects**: Add subjects with category (Science, Arts, Language, Technical)
- **Topics**: Add topics under each subject per term
- subject Combinations**: for o-level and a-level based on school will have defined
---

## 4. Academic Structure

The app follows the **Uganda National Curriculum**:

| Level | Classes | Notes |
|-------|---------|-------|
| O-Level | S1, S2, S3, S4 | Core subjects + UNEB O-Level exams |
| A-Level | S5, S6 | Subject combinations + UACE exams |

**Grading Scale (East African)**:

| Grade | Min % | Label |
|-------|-------|-------|
| A | 80% | Distinction |
| B | 70% | Credit |
| C | 60% | Credit |
| D | 50% | Pass |
| E | 40% | Pass |
| O | 30% | Subsidiary |
| F | 0% | Failure |

---

**subjects**:
* English Language
* Mathematics
* Physics
* Chemistry
* Biology
* Advanced Mathematics
* French
* History
* Geography
* Kiswahili
* IRE
* CRE
* Physical Education
* Art & Design
* Woodwork
* Metalwork
* ICT
*Agriculture
* Foods and Nutrition
* Entrepreneurship
* Economics
- so to save admins time, lets have a default list of subjects and subject combinations, but also allow admins to add, edit and delete subjects and subject combinations.


## 5. Technology Stack

| Layer | Technology |
|-------|-----------|
| Framework | React Native + Expo (SDK 52) |
| Navigation | Expo Router (file-based routing) |
| Database | Google Cloud Firestore |
| Authentication | Firebase Auth |
| File Storage | Firebase Storage |
| Language | TypeScript |
| Notifications | Expo Notifications (Push) |

---

 The main goal  for this app, is to have a parent see value for their school fees, so whatsover we do while coding, should be looking into that direction,
 A parent should see a beatiful profesional interface of the screen, have their childs proifle picture, the marks, the course recommendations for A Level studnets and Subject combinations, or Vacations courses an O level student would go for basing on the marks, 
 We should have the the courses from diffrent universties and diffrnet institutes/collages, so the recomedations are accurate, 
 If possible use AI in the AP to recommend these and allow a student and parent interact with it, 
 Student and parent share same account,
 If you find any other feature that you think a parent or student would find useful please suggest it

 Note;
      1: This is not a full school management system rather a simple app intended at giving a parent a value of their money,
      2: The school assignments, projects,exercises, quizes and group work all are aimed at 20%, its only the end of term exams that make up 80%,
      3: these are kept as the student goes to next class, fro s1 to s4 for O level and then from s5 to s6 for A level students,
      4, A system owner account thats not in anyway related to the school, but can disable the school from using the app incase of anything,
      5, Nabisunsa girls is a ugandan school, while you code, everything should be in line with Ugandan education system
** The student dashboard should be more of a billboard, like youve seen billoard display adds, eg your best perfomed subject is maths, with your  current third term grades, you qualify to for bachelors in computer science in any university in uganda, you can apply to one of your choice, or specify univrsity, or even an institute, with the cut off points and requirements, with a button to apply directly from the app, "APPLY NOW" or a button to "VIEW COURSE DETAILS" which will show the course details and requirements,  the courses could be from universities like, Makerere, Kyambogo, Mbarara, Gulu, Mubs,Nsbm,IUCEA, and many more, institutes like watoto, st. lawrence, nkumba, and many more, ** we should have a button to view courses by subject, "View Courses by Subject" which will show the courses by subject, **we should have a button to view courses by university, "View Courses by University" which will show the courses by university, **we should have a button to view courses by institute, "View Courses by Institute" which will show the courses by institute, **we should have a button to view courses by subject, "View Courses by Subject" which will show the courses by subject, also talk about the jobs available if one chooses to do a certain course, and the jobs they can get, and the salary they can expect, and the growth prospects of the student, eg a student in s3, and has very good marks in mathematics and physical education, the student should be able to see that they can be a pilot, or an air traffic controller, and the requirements for it, and the salary they can expect, and the growth prospects of the student, and advise them on what they can do to be able to achieve that.

Ideally we are are aiming at making studnts and parents find value in this app, an that value is to make their life easier and better, in line with the school and the ugandan education system.

One last thing i had forgotten to say is the assignments, quizes, gropu work, projects, exercises of a term make 20% and the end of term exams make 80%, so app should in position to do right mathemathics on that.
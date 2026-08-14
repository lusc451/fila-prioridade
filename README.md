# Fila Prioridade

Create a responsive web application for patient appointment priority classification and queue management. The system should have a professional, clean, accessible interface designed for administrative use in a healthcare setting.

The main goal is to allow users to register patients and healthcare professionals, create appointment queue entries, classify priorities, filter records, and manage the appointment queue efficiently.

Visual and user experience guidelines

Build a modern, responsive, intuitive interface optimized for desktop use while remaining functional on tablets and mobile devices.

Use a layout with a sidebar navigation menu, top header, and central content area.

Include visual components such as cards, tables, filters, status badges, action buttons, and confirmation modals.

Ensure readability, strong contrast, clear navigation, and well-labeled form fields.

Use relevant icons for patients, healthcare professionals, calendars, phone numbers, priorities, and editing.

The application interface should be in Brazilian Portuguese.

Required screens

The application must include at least the following five screens:

1. Login Screen

Create an authentication screen containing:

Email or username field;

Password field;

“Remember me” option;

“Sign in” button;

Password recovery link;

Validation messages for required fields and invalid credentials.

Use a clean and institutional visual style related to healthcare appointment management.

2. Appointment Queue Overview Screen

Create a main dashboard to display the appointment queue.

The screen must include:

Summary indicators at the top showing the number of appointments in each priority category;

Search field for patient name, phone number, professional name, or specialty;

Filters by:

priority;

healthcare professional;

specialty;

first appointment status;

last appointment date range;

queue entry date;

A table or list containing:

patient name;

date of birth;

phone number;

professional name;

specialty;

first appointment indicator;

last appointment date;

notes;

priority;

queue entry date;

actions to view, edit, remove, and mark as completed.

Display priority using a prominent colored badge or label.

Allow sorting by priority, queue entry date, and last appointment date.

Include a prominent “Add appointment to queue” button.

Appointments should be organized according to the following priority order:

Urgency;

Priority / Exam;

Priority Follow-up;

Routine Follow-up.

3. Patient Registration Screen

Create a screen for creating and editing patient records.

Required fields:

Full name;

Date of birth;

Phone number;

Optional general notes field;

“Save”, “Cancel”, and “Delete” buttons when editing.

Include validations:

Full name is required;

Date of birth is required and cannot be in the future;

Phone number is required and should use a Brazilian phone format;

Display clear validation messages below invalid fields.

Also include a patient list with search by name or phone number.

4. Healthcare Professional Registration Screen

Create a screen for creating and editing healthcare professional records.

Required fields:

Full name;

Specialty;

Optional phone number or contact information;

Professional status: active or inactive;

“Save”, “Cancel”, and “Delete” buttons when editing.

Include a list of registered professionals with search by name or specialty and filtering by status.

5. Add Appointment to Queue Screen

Create a page or modal with a card-style interface for adding a new appointment to the queue.

The card must contain the following fields:

Patient information

Select an existing patient;

Automatically display the selected patient’s name, date of birth, and phone number;

Include a button or link to create a new patient without leaving the current screen.

Professional information

Select a healthcare professional;

Automatically display the selected professional’s name and specialty;

Only show active professionals in the selection list.

Appointment information

Checkbox or selector labeled “First appointment”;

Options: “Yes” and “No”;

“Last appointment date” field;

Mandatory rule: when “First appointment” is set to “Yes”, the “Last appointment date” field must automatically become disabled, cleared, and not required;

When “First appointment” is set to “No”, the “Last appointment date” field must be enabled and required;

Short notes field with placeholder examples:

Follow-up requested by the doctor;

Follow-up to review requested exams;

Prescription renewal;

Exam result evaluation;

Treatment follow-up.

Suggested 500-character limit for notes.

Priority classification

Include a required field where users must select one of the four priority classifications below. Each priority must be visually represented by name, color, and a short description:

Red — Urgency
For cases requiring faster and more immediate attention.

Orange — Priority / Exam
For patients who need priority evaluation, exam review, or prompt continuation of care.

Yellow — Priority Follow-up
For important follow-up appointments without immediate urgency.

Green — Routine Follow-up
For periodic follow-ups, prescription renewals, and non-urgent return visits.

Display these options as visually prominent cards or selectable buttons using the corresponding colors:

Red for Urgency;

Orange for Priority / Exam;

Yellow for Priority Follow-up;

Green for Routine Follow-up.

When a priority is selected, visually highlight the selected option.

Include the following buttons:

“Cancel”;

“Save as draft”;

“Add to queue”.

Business rules

Do not allow an appointment to be added to the queue without a patient, healthcare professional, priority classification, and all required appointment information.

Do not allow inactive professionals to be selected.

When “First appointment” is set to “Yes”, the “Last appointment date” field must remain disabled.

When “First appointment” is set to “No”, the “Last appointment date” field must be required.

The last appointment date cannot be in the future.

Display a confirmation dialog before removing an appointment from the queue.

Allow priority changes directly from the appointment queue overview screen.

Allow users to mark appointments as completed, removing them from the active queue while preserving them in appointment history.

Create a completed appointment history screen or section accessible through the sidebar menu.

Demo data

Populate the application with fictional data to demonstrate the interface, including:

At least 8 patients;

At least 5 healthcare professionals from different specialties;

At least 12 queue entries distributed across all four priority categories;

A variety of first appointments and return appointments;

Realistic, short appointment notes.

Do not use real patient information. Prioritize a clear, organized, and healthcare-appropriate experience for managing appointment queues.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/913829fe-485b-4e80-a82e-b7dcd99f0b15).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

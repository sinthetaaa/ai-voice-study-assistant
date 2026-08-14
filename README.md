# StudyLoop 🎙️📚

### Adaptive AI Voice Study Coach for Active Recall, Mastery Tracking, and Personalized Learning

StudyLoop is an AI-powered voice study assistant that transforms static study material into an interactive, adaptive learning experience.

Instead of simply summarizing uploaded documents, StudyLoop extracts concepts from the material, generates grounded questions, conducts spoken study sessions, evaluates learner responses, tracks concept-level mastery, adapts question difficulty, provides targeted remediation, and schedules concepts for future review.

The goal is to make studying feel less like reading notes and more like having a personalized oral tutor that continuously adapts to what the learner actually understands.

---

## ✨ What StudyLoop Does

A learner uploads study material and StudyLoop automatically converts it into a structured learning experience.

```text
Upload Study Material
        ↓
Document Parsing
        ↓
Semantic Chunking
        ↓
Vector Embeddings
        ↓
Concept Extraction
        ↓
Grounded Question Generation
        ↓
AI Voice Study Session
        ↓
Speech-to-Text
        ↓
Answer Evaluation
        ↓
Session Mastery Update
        ↓
Adaptive Progression / Remediation
        ↓
Spaced Review Scheduling
```

Rather than treating a study session as a static quiz, StudyLoop maintains a learning state for each session and uses the learner's answers to decide what should happen next.

---

# 🎯 Core Features

## 📄 Multi-Stage Document Ingestion

StudyLoop provides an asynchronous document-processing pipeline that prepares uploaded study material for AI-assisted learning.

The current pipeline performs:

- document upload and storage
- document parsing
- structured unit extraction
- semantic chunk generation
- vector embedding generation
- concept extraction
- concept-to-source grounding
- readiness tracking

PDF documents are parsed using a layout-aware pipeline, allowing StudyLoop to work with real lecture material and research papers rather than requiring manually formatted input.

The document architecture is designed to support additional common study formats such as:

- PDF
- PPT / PPTX
- DOC / DOCX
- TXT
- CSV

Uploaded documents are currently limited to **50 MB per file**.

---

## 🧠 Automatic Concept Extraction

StudyLoop analyzes the uploaded material and extracts the important concepts a learner should understand.

Each extracted concept includes information such as:

- concept name
- description
- importance
- difficulty
- supporting source chunks

Concepts remain connected to their original evidence so downstream questions and evaluations can remain grounded in the learner's actual study material.

---

## ❓ Grounded Question Generation

StudyLoop generates questions directly from the extracted concepts and their supporting document chunks.

Questions are generated across three cognitive levels:

| Question Type | Difficulty | Purpose |
|---|---|---|
| `RECALL` | Easy | Test factual retrieval |
| `UNDERSTANDING` | Medium | Test conceptual understanding |
| `APPLICATION` | Hard | Test application and reasoning |

Generated questions pass through semantic validation before being accepted.

Validation checks include:

- target-concept alignment
- source grounding
- valid evidence chunks
- requested question type
- expected difficulty
- duplicate/type consistency

This helps prevent the model from generating a technically related question that actually tests a different concept.

---

# 🎙️ Voice-First Learning

StudyLoop is designed around spoken interaction rather than a conventional text chatbot.

The AI tutor asks questions verbally using local text-to-speech.

While the question is being spoken, its text is progressively revealed on screen so that the visible question remains synchronized with the voice experience.

```text
AI begins speaking
        ↓
Question words progressively appear
        ↓
Question audio finishes
        ↓
Microphone becomes available
        ↓
Learner answers verbally
```

The learner cannot begin recording before the question has finished.

This creates a deliberate conversational turn-taking model instead of simultaneously showing the entire question and playing audio afterward.

---

## 🎤 Interactive Voice Answering

Learners answer questions using the microphone.

The recording interface represents the current voice state visually:

```text
Before recording
      ↓
Microphone

Recording + silence
      ↓
──────────

Recording + speech
      ↓
∿∿∿∿∿∿∿∿

Recording + silence
      ↓
──────────
```

The learner taps once to begin recording and again to finish.

Recorded audio is sent through StudyLoop's local speech-recognition pipeline before entering the normal answer-evaluation system.

---

# 🗣️ Local Speech AI

StudyLoop keeps the core speech pipeline local.

## Speech-to-Text

Voice answers are transcribed using MLX-based Whisper inference.

Current model:

```text
mlx-community/whisper-large-v3-turbo-asr-fp16
```

The transcription service converts the learner's recorded answer into text and then sends that transcription through the same evaluation and adaptive-learning pipeline used for text answers.

---

## Text-to-Speech

StudyLoop uses **Qwen3-TTS** for the tutor voice.

The selected tutor voice is:

```text
Ryan
```

The original voice generation configuration is preserved, while playback uses a small **1.07× frontend speed adjustment** to make the tutor sound slightly more responsive without changing the speaker characteristics.

TTS is used for:

- asking study questions
- explaining answer analysis
- remediation feedback
- conversational study-session responses

---

# 🧪 AI Answer Evaluation

Once an answer is transcribed, StudyLoop evaluates it against the relevant concept and supporting study material.

The evaluation system determines information such as:

- correctness
- answer score
- strengths
- missing information
- misconceptions
- evidence
- remediation requirements

Responses are classified into learning outcomes such as:

```text
CORRECT
PARTIAL
INCORRECT
```

Evaluation is not the end of the pipeline.

The result becomes evidence for the adaptive-learning engine.

---

# 📈 Session-Local Mastery

StudyLoop maintains concept mastery specifically for the **current learning session**.

Every fresh session begins with:

```text
0% visible mastery
```

Previous learning history can still be retained for review scheduling and long-term learning behavior, but it does not artificially inflate the visible mastery of a new session.

Mastery increases only from evidence demonstrated during that session.

Different question levels contribute different evidence weights, allowing harder questions to provide stronger evidence of understanding.

Concept progress is therefore driven by demonstrated performance rather than simply counting completed questions.

---

# 🔄 Adaptive Learning Engine

After every evaluated answer, StudyLoop decides what should happen next.

Depending on learner performance, the system can:

```text
Ask another question
        ↓
Increase difficulty
        ↓
Advance to another concept
        ↓
Provide remediation
        ↓
Re-test a weak concept
        ↓
Schedule the concept for later review
```

This behavior is handled by StudyLoop's adaptive learning and learning-loop services rather than being left entirely to an LLM.

That separation keeps the learning policy deterministic and testable while using AI for tasks where generative reasoning is useful.

---

# 🩹 Targeted Remediation

Incorrect or incomplete answers can trigger targeted remediation.

Instead of simply revealing a complete answer, StudyLoop identifies the important missing idea and produces concise instructional feedback.

The voice tutor can explain:

- the key missing concept
- an important misconception
- what the learner should focus on
- why the answer was incomplete

The learner can then be tested again using the updated learning state.

---

# 🔊 Narrated Answer Analysis

After a learner finishes answering, StudyLoop generates an answer-analysis view.

The analysis is displayed immediately while the AI tutor verbally explains the evaluation.

This keeps visual feedback independent from speech timing:

```text
Answer submitted
        ↓
STT
        ↓
Evaluation
        ↓
Analysis page appears
        ↓
All feedback visible immediately
        +
Ryan narrates the analysis
```

The learner can then continue to the next adaptive question.

---

# 🧩 Fresh Study Sessions

Every new Normal Study session starts from a clean session state.

A fresh session does **not** carry forward:

- the previous question
- visible mastery percentage
- previous session progression
- previous recommendation state

This allows each study attempt to independently measure what the learner can demonstrate during that session.

---

# ⚡ Study Modes

StudyLoop is being built around two learning experiences.

## Normal Study

Normal Study focuses on deliberate concept mastery.

```text
Upload Material
      ↓
Concept Preparation
      ↓
Question
      ↓
Voice Answer
      ↓
Evaluation
      ↓
Answer Analysis
      ↓
Narrated Feedback
      ↓
Adaptive Next Question
      ↓
Mastery
```

The learner receives detailed feedback after each answer before continuing.

---

## Rapid Viva

Rapid Viva is designed for fast oral-exam preparation.

The intended flow is:

```text
Upload
   ↓
Immediate Voice Q&A
   ↓
Adaptive Questions
   ↓
Continuous Viva
   ↓
Session Completion
   ↓
Consolidated Analysis
   ↓
Recommended Revision
```

Unlike Normal Study, Rapid Viva is designed to avoid interrupting the questioning loop with a full analysis page after every response.

Instead, the learner receives a consolidated performance analysis at the end.

---

# 🕒 Spaced Review System

StudyLoop includes persistent review scheduling so learning does not end when a session finishes.

Concepts can be scheduled for delayed review based on learner performance.

The backend supports:

- review scheduling
- due-review discovery
- dedicated review sessions
- review completion policies
- future concept revisits

This allows StudyLoop to evolve from a single-session tutor into a longer-term learning system.

---

# 🏗️ Architecture

StudyLoop uses a monorepo with three primary applications.

```text
StudyLoop/
│
├── apps/
│   │
│   ├── web/
│   │   └── Next.js + TypeScript
│   │
│   ├── api/
│   │   └── NestJS
│   │
│   └── ai/
│       └── FastAPI / Python
│
├── packages/
├── infra/
├── docs/
└── tests/
```

### Frontend

```text
Next.js
TypeScript
React
Tailwind CSS
Web Audio APIs
```

Responsible for:

- study experience
- document upload
- session UI
- voice recording
- progressive question rendering
- TTS playback
- mastery visualization
- answer analysis
- Rapid Viva experience

---

### Product / Domain API

```text
NestJS
TypeScript
Prisma
BullMQ
```

Responsible for:

- study packs
- documents
- ingestion orchestration
- concepts
- questions
- evaluations
- mastery
- adaptive policies
- learning loop
- study sessions
- review scheduling
- speech orchestration

The NestJS service owns product and learning-domain logic.

---

### AI Service

```text
FastAPI
Python
Local LLM inference
MLX Audio
Qwen3-TTS
Whisper
```

Responsible for AI inference workloads including:

- concept extraction
- question generation
- semantic validation
- answer evaluation
- remediation
- speech transcription
- speech synthesis

Keeping AI inference separate from the main product API allows model infrastructure to evolve independently from application-domain logic.

---

# 🗄️ Data Layer

StudyLoop uses:

```text
PostgreSQL
+
pgvector
```

PostgreSQL stores the learning state and application data while pgvector provides vector similarity capabilities for document retrieval and grounding.

Redis is used alongside the backend infrastructure for asynchronous processing.

Core entities include:

```text
StudyPack
Document
DocumentUnit
DocumentChunk

Concept
ConceptSource
ConceptRelationship

Question
QuestionSource

StudySession
QuestionAttempt
AnswerEvaluation

ConceptMastery
MasteryEvent

SessionConceptProgress
SessionMasteryEvent
```

This structure separates:

- source material
- extracted knowledge
- generated assessment
- learner interaction
- session-local progress
- persistent learning history

---

# 🔍 Retrieval and Grounding

StudyLoop stores vector embeddings for document chunks using pgvector.

Relevant source material can therefore be retrieved when generating or evaluating learning content.

This architecture helps ensure that the tutor remains grounded in the learner's uploaded material rather than behaving like a generic question-answering chatbot.

---

# ⚙️ Asynchronous Ingestion

Document processing is performed asynchronously.

```text
Upload
   ↓
Document record
   ↓
Queue
   ↓
Ingestion worker
   ↓
Parse
   ↓
Chunk
   ↓
Embed
   ↓
READY
```

This prevents large documents from blocking the upload request while expensive parsing and AI preparation occurs.

Study-pack readiness can be queried separately while preparation continues.

---

# 🔌 API Overview

Representative API routes include:

### Study Packs

```http
POST /study-packs
GET  /study-packs
GET  /study-packs/:id
```

### Documents

```http
POST /study-packs/:studyPackId/documents
```

Supports multiple document uploads with server-side file validation.

### Study Readiness

```http
GET /study-packs/:studyPackId/readiness
```

### Study Sessions

```http
POST /study-packs/:studyPackId/sessions
GET  /study-sessions/:sessionId
```

### Voice Answers

```http
POST /study-sessions/:sessionId/voice-answer
```

### Text Answers

```http
POST /study-sessions/:sessionId/answer
```

### Review Sessions

```http
POST /study-packs/:studyPackId/review-sessions
```

The API also exposes internal capabilities for concepts, questions, evaluation, retrieval, remediation, mastery, and speech.

---

# 🧠 Learning Pipeline

A typical StudyLoop turn looks like this:

```text
                   ┌─────────────────┐
                   │ Uploaded Notes  │
                   └────────┬────────┘
                            │
                            ▼
                   ┌─────────────────┐
                   │ Parse + Chunk   │
                   └────────┬────────┘
                            │
                            ▼
                   ┌─────────────────┐
                   │ Vector Embedding│
                   └────────┬────────┘
                            │
                            ▼
                   ┌─────────────────┐
                   │ Extract Concepts│
                   └────────┬────────┘
                            │
                            ▼
                   ┌─────────────────┐
                   │ Generate Question│
                   └────────┬────────┘
                            │
                            ▼
                   ┌─────────────────┐
                   │ Ryan asks aloud │
                   └────────┬────────┘
                            │
                            ▼
                   ┌─────────────────┐
                   │ Learner answers │
                   └────────┬────────┘
                            │
                            ▼
                   ┌─────────────────┐
                   │ Whisper STT     │
                   └────────┬────────┘
                            │
                            ▼
                   ┌─────────────────┐
                   │ AI Evaluation   │
                   └────────┬────────┘
                            │
                            ▼
                   ┌─────────────────┐
                   │ Mastery Update  │
                   └────────┬────────┘
                            │
                            ▼
                   ┌─────────────────┐
                   │ Adaptive Policy │
                   └───────┬─┬───────┘
                           │ │
               ┌───────────┘ └────────────┐
               ▼                          ▼
        ┌─────────────┐            ┌─────────────┐
        │ Remediation │            │  Progress   │
        └─────────────┘            └─────────────┘
```

---

# 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js, React, TypeScript |
| Styling | Tailwind CSS |
| Backend | NestJS |
| AI Service | FastAPI, Python |
| ORM | Prisma |
| Database | PostgreSQL |
| Vector Database | pgvector |
| Queue / Cache | Redis |
| Job Processing | BullMQ |
| Local LLM Runtime | Ollama |
| Speech-to-Text | MLX Whisper |
| Text-to-Speech | Qwen3-TTS |
| Audio | Web Audio API |
| Testing | Jest |
| Infrastructure | Docker |

---

# 🧪 Testing

StudyLoop contains automated tests for important learning policies and session behavior.

Current test coverage includes areas such as:

- session mastery
- fresh-session behavior
- study readiness
- voice response composition
- review scheduling
- review completion

Example:

```bash
npm test -- --runInBand study-sessions
```

The learning policies are intentionally separated from generative AI calls where possible so deterministic behavior can be tested independently.

---

# 🚀 Local Development

## Prerequisites

The project uses local infrastructure and AI services.

Typical requirements include:

```text
Node.js
npm
Python
PostgreSQL
pgvector
Redis
Docker
Ollama
```

Clone the repository:

```bash
git clone https://github.com/sinthetaaa/ai-voice-study-assistant.git

cd ai-voice-study-assistant
```

Install workspace dependencies:

```bash
npm install
```

---

## Environment

Create the required local environment configuration.

Typical variables include:

```env
DATABASE_URL=
REDIS_URL=

WEB_URL=http://localhost:3000
API_URL=http://localhost:4000
AI_SERVICE_URL=http://localhost:8000

OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=
```

Never commit `.env` files or local secrets.

---

## Start Infrastructure

Start PostgreSQL, pgvector, and Redis using the project's local infrastructure configuration.

Then start the services independently.

### API

```bash
cd apps/api
npm run start:dev
```

Default:

```text
http://localhost:4000
```

### AI Service

Run the FastAPI service from `apps/ai`.

Default:

```text
http://localhost:8000
```

### Web

```bash
cd apps/web
npm run dev
```

Then open:

```text
http://localhost:3000
```

---

# 🔐 Local-First AI Architecture

One of StudyLoop's design goals is to make substantial parts of the learning pipeline capable of running locally.

Local inference is particularly useful for:

- learner voice recordings
- study documents
- transcription
- tutor speech
- experimentation with different models

The architecture separates model-specific inference behind the FastAPI service so individual models can be replaced without rewriting the product-domain layer.

---

# 🗺️ Current Development Status

StudyLoop is currently in active MVP development.

### Implemented

- [x] Monorepo architecture
- [x] PostgreSQL + Prisma persistence
- [x] pgvector integration
- [x] Redis-backed infrastructure
- [x] Document upload pipeline
- [x] Asynchronous document ingestion
- [x] PDF parsing
- [x] Semantic chunking
- [x] Vector embeddings
- [x] AI concept extraction
- [x] Concept-source grounding
- [x] Study readiness
- [x] Grounded question generation
- [x] Semantic question validation
- [x] Recall / understanding / application questions
- [x] Answer evaluation
- [x] Adaptive learning decisions
- [x] Targeted remediation
- [x] Session-local mastery
- [x] Persistent mastery history
- [x] Review scheduling
- [x] Due-review discovery
- [x] Review sessions
- [x] Voice-answer recording
- [x] Local speech-to-text
- [x] Local text-to-speech
- [x] Spoken AI questions
- [x] Progressive question reveal
- [x] Narrated answer analysis
- [x] Real frontend ↔ backend study-session integration

### Final MVP Work

- [ ] Optimize concept-extraction latency
- [ ] Reduce first-question preparation latency
- [ ] Complete Rapid Viva end-to-end integration
- [ ] Finalize answer-analysis UX
- [ ] Harden AI retry/failure behavior
- [ ] Complete browser and microphone edge cases
- [ ] Final responsive UI polish
- [ ] Expand end-to-end testing

---

# 💡 Why StudyLoop?

Most AI study tools focus on:

```text
Upload → Summarize → Chat
```

StudyLoop explores a different model:

```text
Upload
   ↓
Model the material
   ↓
Ask
   ↓
Listen
   ↓
Evaluate
   ↓
Measure
   ↓
Adapt
   ↓
Teach
   ↓
Review
```

The core idea is that **learning requires evidence of understanding**.

StudyLoop therefore treats AI not simply as an answer generator, but as part of a larger learning system where deterministic policies, grounded generation, voice interaction, mastery estimation, remediation, and spaced review work together.

---

# 📌 Project Status

**Active development — MVP nearing completion.**

The primary Normal Study pipeline is operational end-to-end, including document ingestion, concept extraction, grounded question generation, spoken questioning, voice answers, evaluation, adaptive progression, mastery tracking, remediation, and narrated feedback.

Current development is focused primarily on performance optimization, Rapid Viva completion, reliability, and final product UX.

---

## Repository

Built as an exploration of adaptive learning systems, local speech AI, retrieval-grounded generation, and production-oriented full-stack AI architecture.

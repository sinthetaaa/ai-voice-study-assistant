"use client";

import {
  ChangeEvent,
  useRef,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

type UploadedDocument = {
  id: number;
  name: string;
  size: string;
};

export default function RapidVivaUploadPage() {
  const router =
    useRouter();

  const input =
    useRef<HTMLInputElement | null>(
      null,
    );

  const [
    documents,
    setDocuments,
  ] =
    useState<
      UploadedDocument[]
    >([]);

  function handleFiles(
    event:
      ChangeEvent<HTMLInputElement>,
  ) {
    const files =
      Array.from(
        event.target.files ?? [],
      );

    setDocuments(
      (current) => [
        ...current,

        ...files.map(
          (
            file,
            index,
          ) => ({
            id:
              Date.now() +
              index,

            name:
              file.name,

            size:
              formatFileSize(
                file.size,
              ),
          }),
        ),
      ],
    );

    event.target.value = "";
  }

  function removeDocument(
    id: number,
  ) {
    setDocuments(
      (current) =>
        current.filter(
          (document) =>
            document.id !== id,
        ),
    );
  }

  return (
    <main className="app-page">
      <div className="app-background" />

      <div className="app-shell">
        <header className="app-header">
          <button
            className="wordmark"
            onClick={() =>
              router.push("/")
            }
          >
            StudyLoop
          </button>

          <button
            className="exit-session"
            onClick={() =>
              router.push("/")
            }
          >
            Back
          </button>
        </header>

        <section className="route-content">
          <div className="section-heading">
            <p className="section-kicker">
              RAPID VIVA
            </p>

            <h1>
              Upload your viva
              material.
            </h1>
          </div>

          <div className="upload-layout route-upload">
            <div className="document-area">
              {!documents.length ? (
                <div className="empty-document-area">
                  Uploaded documents
                  will appear here.
                </div>
              ) : (
                <div className="document-grid">
                  {documents.map(
                    (
                      document,
                    ) => (
                      <article
                        key={
                          document.id
                        }
                        className="document-card glass-card"
                      >
                        <DocumentIcon />

                        <div className="document-copy">
                          <strong>
                            {
                              document.name
                            }
                          </strong>

                          <span>
                            {
                              document.size
                            }
                          </span>
                        </div>

                        <button
                          className="remove-document"
                          onClick={() =>
                            removeDocument(
                              document.id,
                            )
                          }
                        >
                          ×
                        </button>
                      </article>
                    ),
                  )}
                </div>
              )}
            </div>

            <aside className="upload-controls">
              <input
                ref={input}
                className="hidden-file-input"
                type="file"
                multiple
                onChange={
                  handleFiles
                }
              />

              <button
                className="upload-button"
                onClick={() =>
                  input.current?.click()
                }
              >
                Upload
              </button>

              <div className="upload-information">
                <p>
                  Upload the material
                  StudyLoop should use
                  for your viva.
                </p>

                <p>
                  Questions are created
                  only after the material
                  is ready.
                </p>
              </div>

              <button
                className="continue-button"
                disabled={
                  !documents.length
                }
                onClick={() =>
                  router.push(
                    "/rapid-viva",
                  )
                }
              >
                Begin Viva
                <ArrowIcon />
              </button>
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}

function DocumentIcon() {
  return (
    <div className="document-icon">
      <span />
      <span />
      <span />
    </div>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M5 12h13" />
      <path d="m14 7 5 5-5 5" />
    </svg>
  );
}

function formatFileSize(
  bytes: number,
) {
  if (
    bytes <
    1024 * 1024
  ) {
    return `${Math.max(
      1,
      Math.round(
        bytes / 1024,
      ),
    )} KB`;
  }

  return `${(
    bytes /
    (1024 * 1024)
  ).toFixed(1)} MB`;
}

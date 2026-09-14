"use client";

import {
  ChangeEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import {
  ReadinessResult,
  StudyLoopApiError,
  StudyPack,
  StudyPackDocumentManagementItem,
  studyLoopApi,
} from "../../../lib/studyloop-api";

import styles from "./study-pack-management.module.css";

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_FILES_PER_REQUEST = 10;

type BusyAction =
  | "SAVE_DETAILS"
  | "UPLOAD_DOCUMENTS"
  | "DELETE_PACK"
  | `DELETE_DOCUMENT:${string}`
  | null;

type StudyPackManagementProps = {
  studyPackId: string;
  onStudyPackChanged: () => void;
};

export default function StudyPackManagement({
  studyPackId,
  onStudyPackChanged,
}: StudyPackManagementProps) {
  const router = useRouter();

  const fileInput =
    useRef<HTMLInputElement | null>(null);

  const [studyPack, setStudyPack] =
    useState<StudyPack | null>(null);

  const [documents, setDocuments] = useState<
    StudyPackDocumentManagementItem[]
  >([]);

  const [readiness, setReadiness] =
    useState<ReadinessResult | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] =
    useState("");
  const [goal, setGoal] = useState("");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] =
    useState(false);

  const [busyAction, setBusyAction] =
    useState<BusyAction>(null);

  const [error, setError] =
    useState<string | null>(null);

  const [notice, setNotice] =
    useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadManagement() {
      setLoading(true);
      setError(null);

      try {
        const [pack, documentItems, snapshot] =
          await Promise.all([
            studyLoopApi.getStudyPack(studyPackId),
            studyLoopApi.getStudyPackDocuments(
              studyPackId,
            ),
            studyLoopApi.getReadiness(studyPackId),
          ]);

        if (cancelled) {
          return;
        }

        setStudyPack(pack);
        setDocuments(documentItems);
        setReadiness(snapshot);

        setName(pack.name);
        setDescription(pack.description ?? "");
        setGoal(pack.goal ?? "");
      } catch (loadError) {
        if (!cancelled) {
          setError(
            getErrorMessage(
              loadError,
              "Could not load Study Pack management.",
            ),
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadManagement();

    return () => {
      cancelled = true;
    };
  }, [studyPackId]);

  useEffect(() => {
    const preparationIsTransient =
      readiness?.overallState ===
        "PREPARATION_INCOMPLETE" &&
      readiness.preparation.documents.total > 0 &&
      (
        !readiness.preparation.documents.settled ||
        !readiness.preparation.conceptExtraction
          .settled ||
        !readiness.preparation.hierarchy.current ||
        readiness.preparation.hierarchy.status ===
          "DIRTY" ||
        readiness.preparation.hierarchy.status ===
          "GENERATING"
      );

    if (
      !readiness ||
      !preparationIsTransient ||
      busyAction !== null
    ) {
      return;
    }

    let cancelled = false;

    let timeoutId:
      | ReturnType<typeof setTimeout>
      | null = null;

    async function pollPreparation() {
      try {
        const [documentItems, snapshot] =
          await Promise.all([
            studyLoopApi.getStudyPackDocuments(
              studyPackId,
            ),
            studyLoopApi.getReadiness(
              studyPackId,
            ),
          ]);

        if (cancelled) {
          return;
        }

        setDocuments(documentItems);
        setReadiness(snapshot);

        const snapshotIsTransient =
          snapshot.overallState ===
            "PREPARATION_INCOMPLETE" &&
          snapshot.preparation.documents.total > 0 &&
          (
            !snapshot.preparation.documents
              .settled ||
            !snapshot.preparation
              .conceptExtraction.settled ||
            !snapshot.preparation.hierarchy
              .current ||
            snapshot.preparation.hierarchy
              .status === "DIRTY" ||
            snapshot.preparation.hierarchy
              .status === "GENERATING"
          );

        if (snapshotIsTransient) {
          timeoutId = setTimeout(
            () => void pollPreparation(),
            1500,
          );

          return;
        }

        onStudyPackChanged();
      } catch (pollError) {
        if (cancelled) {
          return;
        }

        console.error(
          "Could not refresh Study Pack preparation.",
          pollError,
        );

        timeoutId = setTimeout(
          () => void pollPreparation(),
          3000,
        );
      }
    }

    timeoutId = setTimeout(
      () => void pollPreparation(),
      1500,
    );

    return () => {
      cancelled = true;

      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    };
  }, [
    busyAction,
    onStudyPackChanged,
    readiness,
    studyPackId,
  ]);

  async function refreshPreparation() {
    setRefreshing(true);
    setError(null);

    try {
      const [documentItems, snapshot] =
        await Promise.all([
          studyLoopApi.getStudyPackDocuments(
            studyPackId,
          ),
          studyLoopApi.getReadiness(studyPackId),
        ]);

      setDocuments(documentItems);
      setReadiness(snapshot);
    } catch (refreshError) {
      setError(
        getErrorMessage(
          refreshError,
          "Could not refresh Study Pack preparation.",
        ),
      );
    } finally {
      setRefreshing(false);
    }
  }

  async function saveDetails() {
    if (busyAction) {
      return;
    }

    const trimmedName = name.trim();
    const trimmedDescription =
      description.trim();
    const trimmedGoal = goal.trim();

    if (!trimmedName) {
      setError("Study Pack name cannot be empty.");

      return;
    }

    if (trimmedName.length > 120) {
      setError(
        "Study Pack name must be 120 characters or fewer.",
      );

      return;
    }

    if (trimmedDescription.length > 500) {
      setError(
        "Description must be 500 characters or fewer.",
      );

      return;
    }

    if (trimmedGoal.length > 500) {
      setError(
        "Goal must be 500 characters or fewer.",
      );

      return;
    }

    setBusyAction("SAVE_DETAILS");
    setError(null);
    setNotice(null);

    try {
      const updated =
        await studyLoopApi.updateStudyPack(
          studyPackId,
          {
            name: trimmedName,
            description:
              trimmedDescription || null,
            goal: trimmedGoal || null,
          },
        );

      setStudyPack(updated);
      setName(updated.name);
      setDescription(
        updated.description ?? "",
      );
      setGoal(updated.goal ?? "");

      setNotice("Study Pack details saved.");

      onStudyPackChanged();
    } catch (saveError) {
      setError(
        getErrorMessage(
          saveError,
          "Could not save Study Pack details.",
        ),
      );
    } finally {
      setBusyAction(null);
    }
  }

  function openFilePicker() {
    if (busyAction) {
      return;
    }

    fileInput.current?.click();
  }

  async function handleFiles(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const selectedFiles = Array.from(
      event.target.files ?? [],
    );

    event.target.value = "";

    if (
      selectedFiles.length === 0 ||
      busyAction
    ) {
      return;
    }

    setError(null);
    setNotice(null);

    if (
      selectedFiles.length >
      MAX_FILES_PER_REQUEST
    ) {
      setError(
        `You can upload up to ${MAX_FILES_PER_REQUEST} files at once.`,
      );

      return;
    }

    const oversizedFiles =
      selectedFiles.filter(
        (file) =>
          file.size > MAX_FILE_BYTES,
      );

    const uploadCandidates =
      selectedFiles.filter(
        (file) =>
          file.size <= MAX_FILE_BYTES,
      );

    if (uploadCandidates.length === 0) {
      setError(
        `No files were uploaded. ${oversizedFiles.length} selected ${
          oversizedFiles.length === 1
            ? "file was"
            : "files were"
        } over 50 MB.`,
      );

      return;
    }

    setBusyAction("UPLOAD_DOCUMENTS");

    try {
      const result =
        await studyLoopApi.uploadDocuments(
          studyPackId,
          uploadCandidates,
        );

      const rejected = [
        ...oversizedFiles.map(
          (file) =>
            `${file.name} (over 50 MB)`,
        ),
        ...result.rejected.map((file) => {
          const reason =
            file.reason === "FILE_TOO_LARGE"
              ? "over 50 MB"
              : "unsupported type";

          return `${file.originalName} (${reason})`;
        }),
      ];

      if (result.uploaded > 0) {
        setNotice(
          `${result.uploaded} ${
            result.uploaded === 1
              ? "file"
              : "files"
          } uploaded. StudyLoop is preparing the updated material.`,
        );

        onStudyPackChanged();
      }

      if (rejected.length > 0) {
        setError(
          `Skipped ${rejected.length} ${
            rejected.length === 1
              ? "file"
              : "files"
          }: ${rejected.join(", ")}`,
        );
      }

      await refreshPreparation();
    } catch (uploadError) {
      setError(
        getErrorMessage(
          uploadError,
          "Could not upload the selected material.",
        ),
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function removeDocument(
    document:
      StudyPackDocumentManagementItem,
  ) {
    if (busyAction) {
      return;
    }

    const confirmed = window.confirm(
      `Remove "${document.originalName}" from this Study Pack?\n\nStudyLoop may need to rebuild the learning hierarchy after this material is removed.`,
    );

    if (!confirmed) {
      return;
    }

    setBusyAction(
      `DELETE_DOCUMENT:${document.id}`,
    );

    setError(null);
    setNotice(null);

    try {
      await studyLoopApi.deleteStudyPackDocument(
        studyPackId,
        document.id,
      );

      setNotice(
        `"${document.originalName}" was removed.`,
      );

      await refreshPreparation();

      onStudyPackChanged();
    } catch (deleteError) {
      setError(
        getErrorMessage(
          deleteError,
          "Could not remove this document.",
        ),
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function deleteStudyPack() {
    if (busyAction) {
      return;
    }

    const confirmed = window.confirm(
      `Delete "${studyPack?.name ?? "this Study Pack"}"?\n\nThis permanently removes the Study Pack, its uploaded material, and its saved derived data. This action cannot be undone.`,
    );

    if (!confirmed) {
      return;
    }

    setBusyAction("DELETE_PACK");
    setError(null);
    setNotice(null);

    try {
      await studyLoopApi.deleteStudyPack(
        studyPackId,
      );

      router.replace("/#my-studies");

      window.location.replace(
        "/#my-studies",
      );
    } catch (deleteError) {
      setError(
        getErrorMessage(
          deleteError,
          "Could not delete this Study Pack.",
        ),
      );

      setBusyAction(null);
    }
  }

  if (loading) {
    return (
      <section className={styles.section}>
        <div className={styles.heading}>
          <div>
            <p className="section-kicker">
              MANAGE STUDY PACK
            </p>

            <h2>Study material & settings.</h2>
          </div>
        </div>

        <div
          className={`${styles.loadingCard} glass-card`}
        >
          <span className="small-spinner" />
          <span>Loading management tools…</span>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.section}>
      <div className={styles.heading}>
        <div>
          <p className="section-kicker">
            MANAGE STUDY PACK
          </p>

          <h2>Study material & settings.</h2>
        </div>

        <button
          type="button"
          className={styles.refreshButton}
          disabled={
            refreshing ||
            busyAction !== null
          }
          onClick={() =>
            void refreshPreparation()
          }
        >
          {refreshing
            ? "Refreshing…"
            : "Refresh status"}
        </button>
      </div>

      {(error || notice) && (
        <div
          className={styles.messages}
          aria-live="polite"
        >
          {notice && (
            <p className={styles.notice}>
              {notice}
            </p>
          )}

          {error && (
            <p className={styles.error}>
              {error}
            </p>
          )}
        </div>
      )}

      <div className={styles.grid}>
        <article
          className={`${styles.card} glass-card`}
        >
          <div className={styles.cardHeading}>
            <div>
              <span className={styles.eyebrow}>
                DETAILS
              </span>

              <h3>Study Pack information</h3>
            </div>

            <span className={styles.savedMeta}>
              {studyPack
                ? `${documents.length} ${
                    documents.length === 1
                      ? "document"
                      : "documents"
                  }`
                : "—"}
            </span>
          </div>

          <div className={styles.form}>
            <label className={styles.field}>
              <span>Name</span>

              <input
                value={name}
                maxLength={120}
                disabled={
                  busyAction !== null
                }
                onChange={(event) =>
                  setName(event.target.value)
                }
              />

              <small>
                {name.length} / 120
              </small>
            </label>

            <label className={styles.field}>
              <span>Description</span>

              <textarea
                value={description}
                maxLength={500}
                rows={4}
                disabled={
                  busyAction !== null
                }
                onChange={(event) =>
                  setDescription(
                    event.target.value,
                  )
                }
              />

              <small>
                {description.length} / 500
              </small>
            </label>

            <label className={styles.field}>
              <span>Learning goal</span>

              <textarea
                value={goal}
                maxLength={500}
                rows={3}
                disabled={
                  busyAction !== null
                }
                placeholder="What do you want to achieve with this material?"
                onChange={(event) =>
                  setGoal(event.target.value)
                }
              />

              <small>
                {goal.length} / 500
              </small>
            </label>

            <div
              className={
                styles.formActions
              }
            >
              <button
                type="button"
                className={
                  styles.primaryButton
                }
                disabled={
                  busyAction !== null
                }
                onClick={() =>
                  void saveDetails()
                }
              >
                {busyAction ===
                "SAVE_DETAILS"
                  ? "Saving…"
                  : "Save details"}
              </button>
            </div>
          </div>
        </article>

        <article
          className={`${styles.card} glass-card`}
        >
          <div className={styles.cardHeading}>
            <div>
              <span className={styles.eyebrow}>
                PREPARATION
              </span>

              <h3>Learning readiness</h3>
            </div>

            {readiness && (
              <StatusBadge
                status={
                  readiness.preparation.state
                }
              />
            )}
          </div>

          {readiness ? (
            <>
              <p
                className={
                  styles.preparationLead
                }
              >
                {getPreparationMessage(
                  readiness,
                )}
              </p>

              <div
                className={
                  styles.preparationMetrics
                }
              >
                <Metric
                  label="Documents ready"
                  value={`${readiness.preparation.documents.ready}/${readiness.preparation.documents.total}`}
                />

                <Metric
                  label="Concepts"
                  value={
                    readiness.counts
                      .activeConceptCount
                  }
                />

                <Metric
                  label="Hierarchy"
                  value={
                    readiness.preparation
                      .hierarchy.current
                      ? "Current"
                      : formatStatus(
                          readiness
                            .preparation
                            .hierarchy
                            .status,
                        )
                  }
                />
              </div>

              <div
                className={
                  styles.hierarchyMeta
                }
              >
                <span>
                  Revision{" "}
                  {
                    readiness.preparation
                      .hierarchy.revision
                  }
                </span>

                <span>
                  Generated{" "}
                  {readiness.preparation
                    .hierarchy
                    .generatedRevision ??
                    "—"}
                </span>
              </div>

              {readiness.preparation
                .hasWarnings && (
                <p
                  className={
                    styles.warning
                  }
                >
                  Preparation completed with
                  warnings. Check the document
                  statuses below.
                </p>
              )}
            </>
          ) : (
            <p
              className={
                styles.preparationLead
              }
            >
              Preparation state is unavailable.
            </p>
          )}
        </article>
      </div>

      <article
        className={`${styles.documentsCard} glass-card`}
      >
        <div className={styles.cardHeading}>
          <div>
            <span className={styles.eyebrow}>
              MATERIAL
            </span>

            <h3>Documents</h3>
          </div>

          <div
            className={
              styles.documentActions
            }
          >
            <input
              ref={fileInput}
              className={styles.fileInput}
              type="file"
              multiple
              onChange={(event) =>
                void handleFiles(event)
              }
            />

            <button
              type="button"
              className={
                styles.primaryButton
              }
              disabled={
                busyAction !== null
              }
              onClick={openFilePicker}
            >
              {busyAction ===
              "UPLOAD_DOCUMENTS"
                ? "Uploading…"
                : "Add material"}
            </button>
          </div>
        </div>

        <p className={styles.documentsHelp}>
          Add up to 10 files at once, with a
          maximum size of 50 MB per file.
          Preparation may temporarily become
          unavailable while StudyLoop processes
          new or removed material.
        </p>

        {documents.length === 0 ? (
          <div
            className={
              styles.emptyDocuments
            }
          >
            <strong>
              No material in this Study Pack.
            </strong>

            <span>
              Add study material to prepare
              concepts and begin studying.
            </span>
          </div>
        ) : (
          <div
            className={
              styles.documentList
            }
          >
            {documents.map((document) => {
              const deleting =
                busyAction ===
                `DELETE_DOCUMENT:${document.id}`;

              const documentFailure =
                document.errorMessage ??
                document.conceptErrorMessage;

              return (
                <div
                  key={document.id}
                  className={
                    styles.documentRow
                  }
                >
                  <div
                    className={
                      styles.documentMain
                    }
                  >
                    <div
                      className={
                        styles.fileIcon
                      }
                      aria-hidden="true"
                    >
                      <span />
                      <span />
                      <span />
                    </div>

                    <div
                      className={
                        styles.documentCopy
                      }
                    >
                      <strong>
                        {
                          document.originalName
                        }
                      </strong>

                      <span>
                        {formatBytes(
                          document.sizeBytes,
                        )}
                        {" · "}
                        {formatDateTime(
                          document.createdAt,
                        )}
                      </span>

                      {documentFailure && (
                        <p
                          className={
                            styles.documentError
                          }
                        >
                          {documentFailure}
                        </p>
                      )}
                    </div>
                  </div>

                  <div
                    className={
                      styles.documentStatus
                    }
                  >
                    <StatusBadge
                      label="File"
                      status={
                        document.status
                      }
                    />

                    <StatusBadge
                      label="Concepts"
                      status={
                        document.conceptStatus
                      }
                    />
                  </div>

                  <button
                    type="button"
                    className={
                      styles.removeButton
                    }
                    disabled={
                      busyAction !== null
                    }
                    onClick={() =>
                      void removeDocument(
                        document,
                      )
                    }
                  >
                    {deleting
                      ? "Removing…"
                      : "Remove"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </article>

      <article
        className={`${styles.dangerCard} glass-card`}
      >
        <div>
          <span className={styles.dangerEyebrow}>
            DANGER ZONE
          </span>

          <h3>Delete this Study Pack</h3>

          <p>
            Permanently remove the Study Pack,
            its uploaded material, hierarchy,
            and associated saved data.
          </p>
        </div>

        <button
          type="button"
          className={styles.deletePackButton}
          disabled={busyAction !== null}
          onClick={() =>
            void deleteStudyPack()
          }
        >
          {busyAction === "DELETE_PACK"
            ? "Deleting…"
            : "Delete Study Pack"}
        </button>
      </article>
    </section>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className={styles.metric}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function StatusBadge({
  status,
  label,
}: {
  status: string;
  label?: string;
}) {
  return (
    <span
      className={`${styles.statusBadge} ${
        styles[
          `status${toPascalCase(
            status,
          )}` as keyof typeof styles
        ] ?? ""
      }`}
    >
      {label && `${label}: `}
      {formatStatus(status)}
    </span>
  );
}

function getPreparationMessage(
  readiness: ReadinessResult,
) {
  switch (readiness.overallState) {
    case "NORMAL_STUDY_AVAILABLE":
      return "Your current material is prepared and Normal Study is available.";

    case "NORMAL_STUDY_COMPLETE":
      return "The current Normal Study material is complete.";

    case "PREPARATION_INCOMPLETE":
      if (
        readiness.preparation.documents.total ===
        0
      ) {
        return "Add material to prepare this Study Pack.";
      }

      return "StudyLoop is preparing the current material.";

    case "PREPARATION_FAILED":
      return "StudyLoop could not finish preparing some of this material.";

    case "NO_ACTIVE_CONCEPTS":
      return "No active study concepts are currently available.";
  }
}

function getErrorMessage(
  error: unknown,
  fallback: string,
) {
  if (error instanceof StudyLoopApiError) {
    return error.message;
  }

  console.error(error);

  return fallback;
}

function formatStatus(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map(
      (part) =>
        part.charAt(0).toUpperCase() +
        part.slice(1),
    )
    .join(" ");
}

function toPascalCase(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map(
      (part) =>
        part.charAt(0).toUpperCase() +
        part.slice(1),
    )
    .join("");
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = [
    "B",
    "KB",
    "MB",
    "GB",
  ];

  const index = Math.min(
    Math.floor(
      Math.log(bytes) / Math.log(1024),
    ),
    units.length - 1,
  );

  const value =
    bytes / Math.pow(1024, index);

  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }

  return new Intl.DateTimeFormat(
    undefined,
    {
      dateStyle: "medium",
      timeStyle: "short",
    },
  ).format(date);
}

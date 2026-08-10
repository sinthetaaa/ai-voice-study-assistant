export type ProcessDocumentJobData = {
  documentId: string;
};

export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export type JsonObject = {
  [key: string]: JsonValue;
};

export type ParsedDocumentUnit = {
  index: number;
  kind: string;
  label: string;
  text: string;
  metadata: JsonObject;
};

export type ParsedDocumentResponse = {
  filename: string;
  extension: string;
  mime_type: string | null;
  parser: string;

  units: ParsedDocumentUnit[];

  full_text: string;

  metadata: JsonObject;
};

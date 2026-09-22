import RequestFlow from "@/features/services/RequestFlow";
import { DATA_FILE_ACCEPT, MAX_FILE_MB } from "@/features/services/api";

export default function DataRequest() {
  return (
    <RequestFlow
      config={{
        service: "data",
        submitFn: "data_submit_request",
        fileFn: "data_client_file",
        viewPath: "/data-analysis/r/",
        chooseTitle: "What do you need?",
        describeTitle: "Tell us about the project",
        describePlaceholder: "e.g. I have survey data from 500 respondents and need analysis and a report.",
        files: {
          title: "Upload your data",
          accept: DATA_FILE_ACCEPT,
          hint: `Excel, CSV, PDF, Word or ZIP · up to ${MAX_FILE_MB} MB each`,
          laterLabel: "I will provide the data later",
        },
        submitLabel: "SUBMIT REQUEST",
        receivedTitle: "Request Received",
        receivedMessage: "Thank you. An analyst will contact you shortly.",
      }}
    />
  );
}

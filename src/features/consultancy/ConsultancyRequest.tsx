import RequestFlow from "@/features/services/RequestFlow";

export default function ConsultancyRequest() {
  return (
    <RequestFlow
      config={{
        service: "consultancy",
        submitFn: "consult_submit_request",
        fileFn: "consult_client_file",
        viewPath: "/consultancy/r/",
        chooseTitle: "What do you need help with?",
        describeTitle: "Tell us briefly about your need",
        describePlaceholder: "e.g. We need help improving our business operations.",
        submitLabel: "SEND REQUEST",
        receivedTitle: "Consultancy Request Received",
        receivedMessage: "Thank you. A consultant will contact you shortly.",
      }}
    />
  );
}

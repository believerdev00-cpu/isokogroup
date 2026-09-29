import { Link, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { FeePayment, useApplicationFee } from "@/training/features/public/FeePayment";

// /training-center/pay/<link>: an applicant pays the registration fee, from the
// link on their confirmation screen or in their messages. No account needed.
export default function Pay() {
  const { token = "" } = useParams();
  const fee = useApplicationFee(token);
  return (
    <div className="container max-w-xl py-10 sm:py-14">
      <h1 className="page-title">Pay your registration fee</h1>
      {fee.data && (
        <p className="page-subtitle">
          {fee.data.full_name} · {fee.data.program}, {fee.data.intake} · <span className="font-mono">{fee.data.reference}</span>
        </p>
      )}
      <div className="mt-6">
        <FeePayment token={token} />
      </div>
      <div className="mt-8 flex flex-wrap gap-3">
        <Button asChild variant="outline"><Link to="/training-center/application-status">Check application status</Link></Button>
        <Button asChild variant="ghost"><Link to="/training-center">Training Center home</Link></Button>
      </div>
    </div>
  );
}

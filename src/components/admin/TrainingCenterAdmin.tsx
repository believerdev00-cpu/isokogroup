import { Link } from "react-router-dom";
import { GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// The Training Center has its own administration portal (intakes, applications,
// students, classes, payments, certificates). Isoko admins are its admins too.
const TrainingCenterAdmin = () => (
  <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <GraduationCap className="h-5 w-5 text-primary" /> Isoko Training Center
      </CardTitle>
      <CardDescription>
        Intakes, programs, applications, students, classes and trainers, payments, results and certificates are managed in the
        Training Center's admin portal. Your Isoko admin account has access.
      </CardDescription>
    </CardHeader>
    <CardContent className="flex flex-wrap gap-2">
      <Button asChild>
        <Link to="/training-center/admin">Open the admin portal</Link>
      </Button>
      <Button asChild variant="outline">
        <Link to="/training-center/admin/applications">Applications</Link>
      </Button>
      <Button asChild variant="outline">
        <Link to="/training-center">Public pages</Link>
      </Button>
    </CardContent>
  </Card>
);

export default TrainingCenterAdmin;

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert"
import { CloudUpload } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function DeploymentBadge({ deployment }: { deployment: any }) {
  return (
    <Alert>
      <CloudUpload className="h-4 w-4" />
      <AlertTitle>
        <div className="capitalize flex items-center gap-2" target="_blank">
          {deployment.status}
          <span className={cn("w-2 h-2 rounded-full block", deployment.status === "success" ? "bg-green-500" : deployment.status === "failed" ? "bg-red-500" : "bg-slate-500")}></span>
        </div>
      </AlertTitle>
      <AlertDescription>
        <Link href={deployment.url} className="text-xs">{deployment.url}</Link>
      </AlertDescription>
    </Alert>
  );
}
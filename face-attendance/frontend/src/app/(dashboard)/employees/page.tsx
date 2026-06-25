import { ApiError } from "@/components/api-error";
import { BackendUnavailableError, getEmployees } from "@/lib/api";

export default async function EmployeesPage() {
  try {
    const employees = await getEmployees();

    return (
      <section className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-balance">Employees</h1>
          <p className="mt-2 text-muted-foreground text-pretty">
            {employees.length} employees in your organization.
          </p>
        </div>
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Designation</th>
                <th className="px-4 py-3 font-medium">Phone</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => (
                <tr className="border-b last:border-0" key={employee.id}>
                  <td className="px-4 py-3 font-medium">{employee.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {employee.email}
                  </td>
                  <td className="px-4 py-3">
                    {employee.designation ?? "Not assigned"}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {employee.phone ?? "—"}
                  </td>
                  <td className="px-4 py-3 capitalize">{employee.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  } catch (error) {
    if (!(error instanceof BackendUnavailableError)) {
      throw error;
    }
    return (
      <section className="space-y-6">
        <h1 className="text-3xl font-bold text-balance">Employees</h1>
        <ApiError />
      </section>
    );
  }
}

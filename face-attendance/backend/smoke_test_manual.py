"""Live smoke test for teachers/staff feature against a running backend.

Run with: python smoke_test.py  (requires server on 127.0.0.1:8000, seeded DB)
"""

import httpx

BASE = "http://127.0.0.1:8000"
client = httpx.Client(base_url=BASE, follow_redirects=True, timeout=30.0)

results = []


def check(name: str, response: httpx.Response, expect: int = 200) -> None:
    ok = response.status_code == expect
    results.append((name, ok, response.status_code))
    print(f"{'PASS' if ok else 'FAIL'} {name}: {response.status_code}")
    if not ok:
        print(f"     body: {response.text[:300]}")


def csrf_headers() -> dict[str, str]:
    return {"X-CSRF-Token": client.cookies.get("face_attendance_csrf", "")}


# 1. Login
r = client.post(
    "/auth/login",
    json={
        "organization_name": "Demo School",
        "email": "admin@demo.com",
        "password": "admin123",
    },
)
check("login", r, 200)
token = r.json().get("access_token") or client.cookies.get("face_attendance_auth")
headers = {"Authorization": f"Bearer {token}"} if token else {}

# 2. Create a teacher and a staff member (idempotent on email conflict)
def get_or_create_employee(payload):
    r = client.get("/employees", headers=headers)
    for emp in r.json():
        if emp["email"] == payload["email"]:
            print(f"     reused existing employee {payload['email']} (id {emp['id']})")
            return emp, False
    r = client.post("/employees", headers=headers, json=payload)
    check(f"create {payload['designation']}", r, 201)
    return r.json(), True

teacher, _ = get_or_create_employee(
    {"name": "Ayesha Khan", "email": "ayesha@demo.com", "designation": "Teacher", "department": "Science"}
)
teacher_id = teacher["id"]

staff, _ = get_or_create_employee(
    {"name": "Imran Ali", "email": "imran@demo.com", "designation": "Clerk", "department": "Admin"}
)
staff_id = staff["id"]

# 3. Employee listing + designation filter
r = client.get("/employees?designation=teacher", headers=headers)
check("employees?designation=teacher", r)
names = [e["name"] for e in r.json()]
assert "Ayesha Khan" in names and "Imran Ali" not in names, names
print("     grouping OK: teacher filter returned only Ayesha Khan")

# 4. Face enrollment status (no embedding yet)
r = client.get(f"/face/employee-enrollment-status/{teacher_id}", headers=headers)
check("employee enrollment status", r)
assert r.json().get("has_face_enrolled") is False
print("     not enrolled as expected")

# 5. Staff attendance: today + history + export
r = client.get("/attendance/staff/today", headers=headers)
check("staff/today", r)
rows = r.json()
assert any(row["employee_id"] == teacher_id for row in rows), rows
print(f"     today rows include new teacher ({len(rows)} total)")

r = client.get("/attendance/staff/history", headers=headers)
check("staff/history", r)

r = client.get("/attendance/staff/export", headers=headers)
check("staff/export", r)
assert "text/csv" in r.headers.get("content-type", "")
assert "Employee" in r.text.splitlines()[0]
print("     CSV has employee_name header")

# 6. Manual attendance edit for the teacher (present)
r = client.put(
    "/attendance/staff/manual",
    headers={**headers, **csrf_headers()},
    json={"employee_id": teacher_id, "attendance_date": "2026-08-11", "status": "present", "check_in_time": "08:05", "check_out_time": "15:30"},
)
check("staff manual present", r)
manual = r.json()
assert manual.get("employee_name") == "Ayesha Khan", manual
assert manual.get("status") == "present", manual
print(f"     manual row: {manual.get('working_hours')} hours")

# 7. Settings: school_phone PUT + GET round-trip
company_id = teacher["company_id"]
r = client.get(f"/companies/{company_id}/settings", headers=headers)
check("get settings", r)
original_phone = r.json().get("school_phone")

r = client.put(
    f"/companies/{company_id}/settings",
    headers={**headers, **csrf_headers()},
    json={"school_phone": "923001234567"},
)
check("put school_phone", r)
r = client.get(f"/companies/{company_id}/settings", headers=headers)
assert r.json().get("school_phone") == "923001234567", r.json()
print("     school_phone round-trip OK")

# restore original value
r = client.put(
    f"/companies/{company_id}/settings",
    headers={**headers, **csrf_headers()},
    json={"school_phone": original_phone},
)
check("restore school_phone", r)

# 8. Idempotent duplicate manual scan (same employee+date)
r = client.put(
    "/attendance/staff/manual",
    headers={**headers, **csrf_headers()},
    json={"employee_id": teacher_id, "attendance_date": "2026-08-11", "status": "present", "check_in_time": "08:05", "check_out_time": "15:30"},
)
check("staff manual idempotent", r)
same_row = r.json()
assert same_row["attendance_id"] == manual["attendance_id"], "expected same attendance row"
print("     duplicate edit reused the same row")

# 9. CSRF: cookie-auth with wrong token rejected, right token accepted
no_bearer = {"X-CSRF-Token": "wrong-token"}
r = client.put(
    f"/companies/{company_id}/settings",
    headers=no_bearer,
    json={"school_phone": "923001234567"},
)
check("CSRF rejected", r, 403)
r = client.put(
    f"/companies/{company_id}/settings",
    headers=csrf_headers(),
    json={"school_phone": "923001234567"},
)
check("CSRF accepted", r, 200)
r = client.put(
    f"/companies/{company_id}/settings",
    headers=csrf_headers(),
    json={"school_phone": original_phone},
)
check("restore school_phone (final)", r)

print()
failed = [n for n, ok, _ in results if not ok]
print(f"{len(results) - len(failed)}/{len(results)} checks passed")
if failed:
    print("FAILED:", failed)
    raise SystemExit(1)

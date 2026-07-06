"""student_whatsapp_system

Revision ID: a0ddfb82a57e
Revises: b7c4d9e8f012
Create Date: 2026-06-29 13:12:36.607192
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = 'a0ddfb82a57e'
down_revision: str | None = 'b7c4d9e8f012'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('students',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('school_id', sa.Integer(), nullable=False),
    sa.Column('class_id', sa.Integer(), nullable=False),
    sa.Column('student_name', sa.String(length=255), nullable=False),
    sa.Column('student_code', sa.String(length=100), nullable=False),
    sa.Column('grade', sa.String(length=50), nullable=False),
    sa.Column('section', sa.String(length=20), nullable=False),
    sa.Column('parent_name', sa.String(length=255), nullable=False),
    sa.Column('parent_phone', sa.String(length=20), nullable=False),
    sa.Column('parent_phone_2', sa.String(length=20), nullable=True),
    sa.Column('profile_image', sa.Text(), nullable=True),
    sa.Column('status', sa.String(length=50), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['class_id'], ['branches.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['school_id'], ['companies.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('school_id', 'student_code', name='uq_school_student_code')
    )
    op.create_index(op.f('ix_students_class_id'), 'students', ['class_id'], unique=False)
    op.create_index(op.f('ix_students_id'), 'students', ['id'], unique=False)
    op.create_index(op.f('ix_students_school_id'), 'students', ['school_id'], unique=False)
    op.create_index(op.f('ix_students_student_code'), 'students', ['student_code'], unique=False)

    op.execute(
        """
        INSERT INTO students (
            id,
            school_id,
            class_id,
            student_name,
            student_code,
            grade,
            section,
            parent_name,
            parent_phone,
            parent_phone_2,
            profile_image,
            status,
            created_at,
            updated_at
        )
        SELECT
            employees.id,
            employees.company_id,
            employees.branch_id,
            employees.name,
            'EMP-' || employees.id::text,
            'Class 1',
            'A',
            'Parent/Guardian',
            '920000000000',
            NULL,
            employees.headshot_url,
            employees.status,
            employees.created_at,
            employees.updated_at
        FROM employees
        ON CONFLICT ON CONSTRAINT uq_school_student_code DO NOTHING
        """
    )
    op.execute(
        """
        SELECT setval(
            pg_get_serial_sequence('students', 'id'),
            COALESCE((SELECT MAX(id) FROM students), 1),
            true
        )
        """
    )

    op.create_table('whatsapp_logs',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('school_id', sa.Integer(), nullable=False),
    sa.Column('student_id', sa.Integer(), nullable=False),
    sa.Column('parent_phone', sa.String(length=20), nullable=False),
    sa.Column('message_type', sa.String(length=50), nullable=False),
    sa.Column('message_body', sa.Text(), nullable=False),
    sa.Column('status', sa.String(length=50), nullable=False),
    sa.Column('meta_message_id', sa.String(length=255), nullable=True),
    sa.Column('sent_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['school_id'], ['companies.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['student_id'], ['students.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_whatsapp_logs_created_at'), 'whatsapp_logs', ['created_at'], unique=False)
    op.create_index(op.f('ix_whatsapp_logs_id'), 'whatsapp_logs', ['id'], unique=False)
    op.create_index(op.f('ix_whatsapp_logs_message_type'), 'whatsapp_logs', ['message_type'], unique=False)
    op.create_index(op.f('ix_whatsapp_logs_parent_phone'), 'whatsapp_logs', ['parent_phone'], unique=False)
    op.create_index(op.f('ix_whatsapp_logs_school_id'), 'whatsapp_logs', ['school_id'], unique=False)
    op.create_index(op.f('ix_whatsapp_logs_status'), 'whatsapp_logs', ['status'], unique=False)
    op.create_index(op.f('ix_whatsapp_logs_student_id'), 'whatsapp_logs', ['student_id'], unique=False)

    op.add_column('attendance', sa.Column('student_id', sa.Integer(), nullable=True))
    op.add_column(
        'attendance',
        sa.Column('notification_sent', sa.Boolean(), server_default=sa.false(), nullable=False),
    )
    op.add_column('attendance', sa.Column('notification_status', sa.String(length=50), nullable=True))
    op.execute("UPDATE attendance SET student_id = employee_id")
    op.alter_column('attendance', 'student_id', nullable=False)
    op.drop_index(op.f('ix_attendance_employee_id'), table_name='attendance')
    op.create_index(op.f('ix_attendance_student_id'), 'attendance', ['student_id'], unique=False)
    op.drop_constraint(op.f('attendance_employee_id_fkey'), 'attendance', type_='foreignkey')
    op.create_foreign_key(
        'attendance_student_id_fkey',
        'attendance',
        'students',
        ['student_id'],
        ['id'],
        ondelete='CASCADE',
    )
    op.drop_column('attendance', 'employee_id')
    op.add_column('companies', sa.Column('school_phone', sa.String(length=50), nullable=True))
    op.add_column('companies', sa.Column('school_logo', sa.String(length=500), nullable=True))
    op.add_column(
        'companies',
        sa.Column(
            'absent_alert_time',
            sa.String(length=5),
            server_default='09:00',
            nullable=False,
        ),
    )
    op.add_column('companies', sa.Column('whatsapp_token', sa.String(length=1000), nullable=True))
    op.add_column('companies', sa.Column('whatsapp_phone_id', sa.String(length=100), nullable=True))
    op.add_column('face_embeddings', sa.Column('student_id', sa.Integer(), nullable=True))
    op.execute("UPDATE face_embeddings SET student_id = employee_id")
    op.alter_column('face_embeddings', 'student_id', nullable=False)
    op.drop_index(op.f('ix_face_embeddings_employee_id'), table_name='face_embeddings')
    op.create_index(op.f('ix_face_embeddings_student_id'), 'face_embeddings', ['student_id'], unique=True)
    op.drop_constraint(op.f('face_embeddings_employee_id_fkey'), 'face_embeddings', type_='foreignkey')
    op.create_foreign_key(
        'face_embeddings_student_id_fkey',
        'face_embeddings',
        'students',
        ['student_id'],
        ['id'],
        ondelete='CASCADE',
    )
    op.drop_column('face_embeddings', 'employee_id')


def downgrade() -> None:
    op.add_column('face_embeddings', sa.Column('employee_id', sa.INTEGER(), autoincrement=False, nullable=True))
    op.execute("UPDATE face_embeddings SET employee_id = student_id")
    op.drop_constraint('face_embeddings_student_id_fkey', 'face_embeddings', type_='foreignkey')
    op.create_foreign_key(op.f('face_embeddings_employee_id_fkey'), 'face_embeddings', 'employees', ['employee_id'], ['id'], ondelete='CASCADE')
    op.drop_index(op.f('ix_face_embeddings_student_id'), table_name='face_embeddings')
    op.create_index(op.f('ix_face_embeddings_employee_id'), 'face_embeddings', ['employee_id'], unique=True)
    op.drop_column('face_embeddings', 'student_id')
    op.drop_column('companies', 'whatsapp_phone_id')
    op.drop_column('companies', 'whatsapp_token')
    op.drop_column('companies', 'absent_alert_time')
    op.drop_column('companies', 'school_logo')
    op.drop_column('companies', 'school_phone')
    op.add_column('attendance', sa.Column('employee_id', sa.INTEGER(), autoincrement=False, nullable=True))
    op.execute("UPDATE attendance SET employee_id = student_id")
    op.drop_constraint('attendance_student_id_fkey', 'attendance', type_='foreignkey')
    op.create_foreign_key(op.f('attendance_employee_id_fkey'), 'attendance', 'employees', ['employee_id'], ['id'], ondelete='CASCADE')
    op.drop_index(op.f('ix_attendance_student_id'), table_name='attendance')
    op.create_index(op.f('ix_attendance_employee_id'), 'attendance', ['employee_id'], unique=False)
    op.drop_column('attendance', 'notification_status')
    op.drop_column('attendance', 'notification_sent')
    op.drop_column('attendance', 'student_id')
    op.drop_index(op.f('ix_whatsapp_logs_student_id'), table_name='whatsapp_logs')
    op.drop_index(op.f('ix_whatsapp_logs_status'), table_name='whatsapp_logs')
    op.drop_index(op.f('ix_whatsapp_logs_school_id'), table_name='whatsapp_logs')
    op.drop_index(op.f('ix_whatsapp_logs_parent_phone'), table_name='whatsapp_logs')
    op.drop_index(op.f('ix_whatsapp_logs_message_type'), table_name='whatsapp_logs')
    op.drop_index(op.f('ix_whatsapp_logs_id'), table_name='whatsapp_logs')
    op.drop_index(op.f('ix_whatsapp_logs_created_at'), table_name='whatsapp_logs')
    op.drop_table('whatsapp_logs')
    op.drop_index(op.f('ix_students_student_code'), table_name='students')
    op.drop_index(op.f('ix_students_school_id'), table_name='students')
    op.drop_index(op.f('ix_students_id'), table_name='students')
    op.drop_index(op.f('ix_students_class_id'), table_name='students')
    op.drop_table('students')

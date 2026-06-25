from pydantic import BaseModel, ConfigDict, Field


class BranchBase(BaseModel):
    company_id: int
    name: str = Field(min_length=1, max_length=255)
    location: str | None = Field(default=None, max_length=500)


class BranchCreate(BranchBase):
    pass


class BranchRead(BranchBase):
    model_config = ConfigDict(from_attributes=True)

    id: int

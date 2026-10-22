import re
import uuid
from dataclasses import dataclass
from urllib.parse import parse_qs

PROGRAM_MAX_DAYS = 7
_DAY = re.compile(rf"^[1-{PROGRAM_MAX_DAYS}]$")


@dataclass(frozen=True)
class ProgramPostback:
    program_id: str
    day: int


def program_save_data(program_id: str, day: int) -> str:
    return f"action=program_save&id={program_id}&day={day}"


def parse_program_postback(data: str) -> ProgramPostback | None:
    fields = parse_qs(data, keep_blank_values=True)
    if sorted(fields) != ["action", "day", "id"]:
        return None
    if any(len(values) != 1 for values in fields.values()):
        return None
    if fields["action"][0] != "program_save":
        return None
    program_id = fields["id"][0]
    try:
        if str(uuid.UUID(program_id)) != program_id:
            return None
    except ValueError:
        return None
    day = fields["day"][0]
    if _DAY.fullmatch(day) is None:
        return None
    return ProgramPostback(program_id, int(day))

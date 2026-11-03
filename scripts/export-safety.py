"""Exact secret matching without scanning each large archive once per hex token."""
import re

class SecretMatcher:
    def __init__(self, values):
        tokens = {value.encode() for value in values if isinstance(value, str) and value}
        self.hex_tokens = {value for value in tokens if re.fullmatch(rb'[a-f0-9]{64}', value)}
        self.literals = tokens - self.hex_tokens

    def contains(self, data):
        if any(value in data for value in self.literals):
            return True
        if not self.hex_tokens:
            return False
        # Lookahead preserves overlapping matches inside longer hexadecimal runs.
        return any(match.group(1) in self.hex_tokens for match in re.finditer(rb'(?=([a-f0-9]{64}))', data))

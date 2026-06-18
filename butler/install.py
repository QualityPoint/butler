# Copyright (c) 2026, QP and contributors
# For license information, please see license.txt

import click

from butler.setup import after_install as setup


def after_install():
    try:
        print("Setting up Butler...")
        setup()

        click.secho("Thank you for installing Butler!", fg="green")

    except Exception as e:
        BUG_REPORT_URL = "https://github.com/QualityPoint/butler/issues/new"
        click.secho(
            "Installation for Butler app failed due to an error."
            " Please try re-installing the app or"
            f" report the issue on {BUG_REPORT_URL} if not resolved.",
            fg="bright_red",
        )
        raise e

# Generated migration for adding MFA fields to Manager model

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('manager', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='manager',
            name='mfa_enabled',
            field=models.BooleanField(default=False, help_text='Whether MFA is enabled for this manager'),
        ),
        migrations.AddField(
            model_name='manager',
            name='mfa_secret',
            field=models.CharField(blank=True, default='', help_text='TOTP secret key for MFA', max_length=32),
        ),
    ]

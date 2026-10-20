from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('contracts', '0055_contract_tenant_indexes'),
    ]

    operations = [
        migrations.AlterField(
            model_name='absencereportentry',
            name='absence_type',
            field=models.CharField(choices=[('sick', 'Sick'), ('sick_child', 'Sick (child)'), ('sick_certificate', 'Sick (with certificate)'), ('sick_child_certificate', 'Sick (child, with certificate)'), ('vacation', 'Vacation'), ('special_leave', 'Special leave'), ('education', 'Education/Training'), ('overtime_reduction', 'Overtime reduction'), ('other', 'Other')], max_length=30),
        ),
    ]
